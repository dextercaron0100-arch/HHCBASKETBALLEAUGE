using System.Security.Claims;
using System.Text;
using System.Text.Json;
using League.Api;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.HttpOverrides;
using System.Net;
using System.Threading.RateLimiting;

if (args.FirstOrDefault() == "healthcheck")
{
    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
    try { Environment.ExitCode = (await client.GetAsync("http://127.0.0.1:8080/health")).IsSuccessStatusCode ? 0 : 1; }
    catch { Environment.ExitCode = 1; }
    return;
}
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<LeagueDb>(o => { if (builder.Configuration["DatabaseProvider"] == "Postgres") o.UseNpgsql(builder.Configuration.GetConnectionString("League")); else o.UseSqlite(builder.Configuration.GetConnectionString("League")); });
builder.Services.AddIdentity<IdentityUser, IdentityRole>(o => { o.Password.RequiredLength = 12; o.User.RequireUniqueEmail = true; o.Lockout.MaxFailedAccessAttempts = 5; }).AddEntityFrameworkStores<LeagueDb>().AddDefaultTokenProviders();
builder.Services.ConfigureApplicationCookie(o => { o.Cookie.Name = "league.session"; o.Cookie.HttpOnly = true; o.Cookie.SameSite = SameSiteMode.Lax; o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always; o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; }; o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; }; });
builder.Services.AddAntiforgery(o => { o.HeaderName = "X-CSRF-TOKEN"; o.Cookie.Name = "league.csrf"; o.Cookie.HttpOnly = true; o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always; });
builder.Services.AddAuthorization(o => o.AddPolicy("Staff", p => p.RequireRole("Administrator", "Organizer")));
builder.Services.Configure<ForwardedHeadersOptions>(o => { o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto; if (IPAddress.TryParse(builder.Configuration["TrustedProxy"], out var proxy)) o.KnownProxies.Add(proxy); });
builder.Services.AddRateLimiter(o => { o.RejectionStatusCode = 429; o.AddPolicy("Auth", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })); });
builder.Services.AddScoped<LeagueStore>(); builder.Services.AddScoped<UploadService>(); builder.Services.AddSignalR(); builder.Services.AddOpenApi();
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins((builder.Configuration["FrontendOrigin"] ?? "http://localhost:3000").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
var app = builder.Build();
app.UseForwardedHeaders();
app.Use(async (ctx, next) =>
{
    try
    {
        await next();
    }
    catch (AntiforgeryValidationException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { error = "Invalid CSRF token. Refresh and retry." }); }
    catch (RuleException e) { ctx.Response.StatusCode = 409; await ctx.Response.WriteAsJsonAsync(new { error = e.Message }); }
    catch (Exception e) when (e is InvalidOperationException or FormatException or KeyNotFoundException or JsonException or ArgumentException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { error = "Invalid or missing data. Check the fields and try again." }); }
});
app.UseCors(); app.UseAuthentication(); app.UseAuthorization();
app.UseRateLimiter();
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api") && ctx.Request.Method is not ("GET" or "HEAD" or "OPTIONS")) await ctx.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(ctx);
    await next();
});
app.MapOpenApi(); app.MapHub<GameHub>("/hubs/games");
app.MapGet("/health", async (LeagueDb db) => await db.Database.CanConnectAsync() ? Results.Ok(new { status = "healthy" }) : Results.StatusCode(503));
app.MapGet("/api/v1/auth/csrf", (HttpContext ctx, IAntiforgery csrf) => Results.Ok(new { token = csrf.GetAndStoreTokens(ctx).RequestToken }));
app.MapGet("/api/v1/auth/me", async (ClaimsPrincipal principal, UserManager<IdentityUser> users) => { var user = await users.GetUserAsync(principal); return user == null ? Results.Unauthorized() : Results.Ok(new { user.Id, user.Email, Roles = await users.GetRolesAsync(user) }); });
app.MapPost("/api/v1/auth/register", async (Credentials input, UserManager<IdentityUser> users) => { var user = new IdentityUser { UserName = input.Email, Email = input.Email }; var result = await users.CreateAsync(user, input.Password); if (!result.Succeeded) return Results.BadRequest(new { error = string.Join(" ", result.Errors.Select(e => e.Description)) }); await users.AddToRoleAsync(user, "TeamManager"); return Results.Ok(new { message = "Account created. Sign in to register your team." }); }).RequireRateLimiting("Auth");
app.MapPost("/api/v1/auth/login", async (Credentials input, SignInManager<IdentityUser> signin) => { var result = await signin.PasswordSignInAsync(input.Email, input.Password, false, true); return result.Succeeded ? Results.Ok(new { message = "Signed in" }) : Results.Json(new { error = "Invalid credentials or temporarily locked account." }, statusCode: 401); }).RequireRateLimiting("Auth");
app.MapPost("/api/v1/auth/logout", async (SignInManager<IdentityUser> signin) => { await signin.SignOutAsync(); return Results.Ok(); }).RequireAuthorization();
app.MapGet("/api/v1/public", async (LeagueStore store) => PublicView(await store.Read()));
app.MapGet("/api/v1/standings/{seasonId}/{division}/{group}", async (string seasonId, string division, string group, LeagueStore store) => Competition.Standings(await store.Read(), seasonId, division, group));
app.MapGet("/api/v1/leaders/{seasonId}/{division}", async (string seasonId, string division, LeagueStore store) => Competition.Leaders(await store.Read(), seasonId, division));
app.MapGet("/api/v1/games/{id}", async (string id, LeagueStore store) => GameView((await store.Read()).Games.Single(g => g.Id == id)));
app.MapGet("/api/v1/admin/state", async (LeagueStore store) => await store.Read()).RequireAuthorization("Staff");
app.MapGet("/api/v1/admin/users", async (UserManager<IdentityUser> users) => { var result = new List<object>(); foreach (var user in await users.Users.ToListAsync()) result.Add(new { user.Id, user.Email, Roles = await users.GetRolesAsync(user) }); return result; }).RequireAuthorization("Staff");
app.MapPost("/api/v1/admin/role", async (JsonElement input, UserManager<IdentityUser> users, ClaimsPrincipal principal, LeagueStore store) => { var role = input.Text("role"); if (role is not ("Organizer" or "Scorekeeper" or "TeamManager")) throw new RuleException("Choose an allowed role."); var user = await users.FindByIdAsync(input.Text("userId")) ?? throw new RuleException("Unknown user."); var result = await users.AddToRoleAsync(user, role); if (!result.Succeeded) throw new RuleException("Role assignment failed."); await store.Change(UserId(principal), "role", user.Id, role, _ => { }); return Results.Ok(); }).RequireAuthorization(p => p.RequireRole("Administrator"));
app.MapPost("/api/v1/admin/command", async (JsonElement input, ClaimsPrincipal principal, LeagueStore store, IHubContext<GameHub> hub, UserManager<IdentityUser> users, LeagueDb db) =>
{
    if (input.Text("action") == "teamLogo")
    {
        var logo = input.Text("logo");
        var uploadId = logo.StartsWith("/api/v1/uploads/", StringComparison.Ordinal) ? logo["/api/v1/uploads/".Length..] : "";
        if (!await db.Uploads.AnyAsync(upload => upload.Id == uploadId && !upload.Private && upload.ContentType.StartsWith("image/"))) throw new RuleException("Choose an uploaded public team image.");
    }
    if (input.Text("action") == "assign")
    {
        var scorer = await users.FindByIdAsync(input.Text("scorekeeperId"));
        if (scorer == null || !(await users.GetRolesAsync(scorer)).Any(r => r is "Administrator" or "Organizer" or "Scorekeeper")) throw new RuleException("Assign an account with scorekeeper or staff access.");
    }
    var state = await store.Change(UserId(principal), input.Text("action"), input.Text("id"), input.Text("reason"), s => Commands.Execute(s, input, UserId(principal)));
    await hub.Clients.All.SendAsync("LeagueChanged", state.Revision); return Results.Ok(state);
}).RequireAuthorization("Staff");
app.MapGet("/api/v1/manager", async (ClaimsPrincipal principal, LeagueStore store) => { var state = await store.Read(); var teams = state.Teams.Where(t => t.ManagerId == UserId(principal)).ToList(); return Results.Ok(new { teams, Players = state.Players.Where(p => teams.Any(t => t.Id == p.TeamId)), Amendments = state.Amendments.Where(a => a.SubmittedBy == UserId(principal)) }); }).RequireAuthorization();
app.MapPost("/api/v1/manager/team", async (Team input, ClaimsPrincipal principal, LeagueStore store) =>
{
    var state = await store.Change(UserId(principal), "submitTeam", "", "", s => { var season = s.Seasons.Single(x => x.Id == input.SeasonId); if (!season.RegistrationOpen || season.AgeCutoff == null) throw new RuleException("Registration is closed or eligibility rules are not configured."); if (input.Division is not ("Junior" or "Senior") || Competition.GroupCapacity(season, input.Division, input.Group) == 0 || string.IsNullOrWhiteSpace(input.Name)) throw new RuleException("Team name, division, and group are required."); if (s.Teams.Any(t => t.SeasonId == input.SeasonId && t.Division == input.Division && t.Name.Equals(input.Name, StringComparison.OrdinalIgnoreCase))) throw new RuleException("Team name already exists in this division."); input.Id = Guid.NewGuid().ToString(); input.ManagerId = UserId(principal); input.Status = "Pending"; s.Teams.Add(input); }); return Results.Ok(new { message = "Team submitted for approval.", state.Revision });
}).RequireAuthorization();
app.MapPost("/api/v1/manager/player", async (Player input, ClaimsPrincipal principal, LeagueStore store) =>
{
    await store.Change(UserId(principal), "submitPlayer", input.TeamId, "", s => { var team = s.Teams.Single(t => t.Id == input.TeamId && t.ManagerId == UserId(principal)); var season = s.Seasons.Single(x => x.Id == team.SeasonId); if (!season.RegistrationOpen) throw new RuleException("Registration is closed."); if (string.IsNullOrWhiteSpace(input.Name) || input.BirthDate == default || input.Number < 0 || input.Number > 99 || input.Position is not ("PG" or "SG" or "SF" or "PF" or "C")) throw new RuleException("Provide name, birth date, jersey 0–99, and a valid position."); if (s.Players.Any(p => p.TeamId == team.Id && p.Number == input.Number)) throw new RuleException("Jersey number is already registered."); input.Id = Guid.NewGuid().ToString(); input.Status = "Pending"; s.Players.Add(input); }); return Results.Ok(new { message = "Player submitted for eligibility review." });
}).RequireAuthorization();
app.MapPost("/api/v1/manager/amendment", async (Player input, ClaimsPrincipal principal, LeagueStore store) =>
{
    await store.Change(UserId(principal), "submitAmendment", input.Id, "Pending roster review", s =>
    {
        var old = s.Players.Single(p => p.Id == input.Id); var team = s.Teams.Single(t => t.Id == old.TeamId && t.ManagerId == UserId(principal));
        if (string.IsNullOrWhiteSpace(input.Name) || input.BirthDate == default || input.Number < 0 || input.Number > 99 || input.Position is not ("PG" or "SG" or "SF" or "PF" or "C")) throw new RuleException("Invalid amended player fields.");
        if (s.Amendments.Any(a => a.PlayerId == input.Id && a.Status == "Pending")) throw new RuleException("An amendment is already awaiting review.");
        input.TeamId = team.Id; input.Status = old.Status;
        s.Amendments.Add(new(Guid.NewGuid().ToString(), old.Id, input, UserId(principal), "Pending"));
    }); return Results.Ok(new { message = "Roster amendment submitted for approval." });
}).RequireAuthorization();
app.MapPost("/api/v1/games/{id}/lease", async (string id, JsonElement input, ClaimsPrincipal principal, LeagueStore store) =>
{
    var state = await store.Change(UserId(principal), "scoreLease", id, "", s => { var g = s.Games.Single(g => g.Id == id); CheckScorer(principal, g); var client = input.Text("clientId"); if (string.IsNullOrWhiteSpace(client)) throw new RuleException("Client ID required."); Scoring.Lease(g, $"{UserId(principal)}:{client}", DateTimeOffset.UtcNow); }); return Results.Ok(GameView(state.Games.Single(g => g.Id == id)));
}).RequireAuthorization();
app.MapPost("/api/v1/games/{id}/score", async (string id, ScoreCommand command, ClaimsPrincipal principal, LeagueStore store, IHubContext<GameHub> hub) =>
{
    var state = await store.Change(UserId(principal), "score", id, command.Reason, s => { var g = s.Games.Single(g => g.Id == id); CheckScorer(principal, g); Scoring.Apply(s, g, command, UserId(principal), DateTimeOffset.UtcNow); }); var view = GameView(state.Games.Single(g => g.Id == id)); await hub.Clients.Group(id).SendAsync("GameChanged", view); return Results.Ok(view);
}).RequireAuthorization();
app.MapGet("/api/v1/scoring", async (LeagueStore store, ClaimsPrincipal principal) => { var state = await store.Read(); return Results.Ok(state.Games.Where(g => IsStaff(principal) || g.ScorekeeperId == UserId(principal)).Select(GameView)); }).RequireAuthorization(p => p.RequireRole("Administrator", "Organizer", "Scorekeeper"));
app.MapGet("/api/v1/admin/finance.csv", async (LeagueStore store) => { var state = await store.Read(); string Csv(string v) => "\"" + (v.StartsWith('=') || v.StartsWith('+') || v.StartsWith('-') || v.StartsWith('@') ? "'" : "") + v.Replace("\"", "\"\"") + "\""; var rows = new[] { "Date,Type,Team,Amount,Description" }.Concat(state.Finance.Select(e => $"{e.Date},{Csv(e.Type)},{Csv(state.Teams.SingleOrDefault(t => t.Id == e.TeamId)?.Name ?? "")},{e.Amount.ToString(System.Globalization.CultureInfo.InvariantCulture)},{Csv(e.Description)}")); return Results.File(Encoding.UTF8.GetBytes(string.Join("\r\n", rows)), "text/csv", "league-finance.csv"); }).RequireAuthorization("Staff");
app.MapPost("/api/v1/uploads", async (HttpRequest request, ClaimsPrincipal principal, UploadService uploads) => { var form = await request.ReadFormAsync(); var file = form.Files.GetFile("file") ?? throw new RuleException("Choose a file."); return Results.Ok(await uploads.Save(file, form["private"] == "true", UserId(principal))); }).RequireAuthorization();
app.MapGet("/api/v1/uploads/{id}", async (string id, ClaimsPrincipal principal, UploadService uploads) => await uploads.Read(id, UserId(principal), IsStaff(principal)));

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<LeagueDb>();
    if (app.Configuration["DatabaseProvider"] == "Postgres") await db.Database.MigrateAsync(); else await db.Database.EnsureCreatedAsync();
    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    foreach (var role in new[] { "Administrator", "Organizer", "Scorekeeper", "TeamManager" }) if (!await roles.RoleExistsAsync(role)) await roles.CreateAsync(new(role));
    var command = args.FirstOrDefault();
    if (command == "bootstrap-admin")
    {
        var email = Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? throw new Exception("Set ADMIN_EMAIL."); var password = Environment.GetEnvironmentVariable("ADMIN_PASSWORD") ?? throw new Exception("Set ADMIN_PASSWORD.");
        var users = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>(); var user = await users.FindByEmailAsync(email);
        if (user == null) { user = new() { UserName = email, Email = email, EmailConfirmed = true }; var result = await users.CreateAsync(user, password); if (!result.Succeeded) throw new Exception(string.Join(" ", result.Errors.Select(e => e.Description))); }
        await users.AddToRoleAsync(user, "Administrator"); Console.WriteLine("Administrator ready."); return;
    }
    if (command == "seed-demo") { await scope.ServiceProvider.GetRequiredService<LeagueStore>().Change("CLI", "seedDemo", "", "Explicit fictional dataset", Demo.Seed); Console.WriteLine("Fictional demo data seeded."); return; }
    if (command == "migrate") { Console.WriteLine("Database ready."); return; }
}
await app.RunAsync();

static string UserId(ClaimsPrincipal principal) => principal.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
static bool IsStaff(ClaimsPrincipal p) => p.IsInRole("Administrator") || p.IsInRole("Organizer");
static void CheckScorer(ClaimsPrincipal principal, Game game) { if (!IsStaff(principal) && !(principal.IsInRole("Scorekeeper") && game.ScorekeeperId == UserId(principal))) throw new RuleException("You are not assigned to score this game."); }
static object GameView(Game g) => new { g.Id, g.SeasonId, g.Division, g.Group, g.Stage, g.BracketKey, g.Number, g.HomeId, g.AwayId, g.Start, g.CourtId, g.Status, g.HomeScore, g.AwayScore, g.Quarter, g.ClockSeconds, g.ClockRunning, g.ClockAt, g.HomeFouls, g.AwayFouls, g.HomeTimeouts, g.AwayTimeouts, g.Version, g.Roster, g.RosterSnapshots, g.Stats, g.QuarterResults, g.ScorekeeperId, g.OfficialIds, ServerTime = DateTimeOffset.UtcNow };
static object PublicView(LeagueState s) => new { s.Revision, s.Demo, Seasons = s.Seasons.Select(x => new { x.Id, x.Name, x.Year, x.RegistrationOpen, x.QuarterSeconds, x.OvertimeSeconds, x.Courts, x.Timezone, x.GroupSizes }), Teams = s.Teams.Where(t => t.Status == "Approved").Select(t => new { t.Id, t.Slot, t.SeasonId, t.Division, t.Group, t.Name, t.Coach, t.AssistantCoach, t.Logo, t.Color }), Players = s.Players.Where(p => p.Status == "Approved" && s.Teams.Any(t => t.Id == p.TeamId && t.Status == "Approved")).Select(p => new { p.Id, p.TeamId, p.Name, p.Number, p.Position, p.Photo, p.RosterRole }), Games = s.Games.Select(GameView), Posts = s.Posts.Where(p => p.Published), s.Awards };
public record Credentials(string Email, string Password);
