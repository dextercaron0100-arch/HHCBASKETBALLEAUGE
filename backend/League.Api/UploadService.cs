using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;

namespace League.Api;

public class UploadRecord
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string OwnerId { get; set; } = "";
    public bool Private { get; set; }
    public string ContentType { get; set; } = "";
    public string Key { get; set; } = "";
}
public class UploadService(LeagueDb db, IConfiguration config, IWebHostEnvironment environment)
{
    AmazonS3Client? Client() => string.IsNullOrEmpty(config["Storage:Endpoint"]) ? null : new(config["Storage:AccessKey"], config["Storage:SecretKey"], new AmazonS3Config { ServiceURL = config["Storage:Endpoint"], ForcePathStyle = true, AuthenticationRegion = config["Storage:Region"] ?? "auto" });
    public async Task<object> Save(IFormFile file, bool confidential, string owner)
    {
        if (file.Length == 0 || file.Length > 10 * 1024 * 1024) throw new RuleException("Files must be between 1 byte and 10 MB.");
        var allowed = new Dictionary<string, string> { [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png", [".webp"] = "image/webp", [".pdf"] = "application/pdf" };
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!allowed.TryGetValue(extension, out var contentType) || (extension == ".pdf" && !confidential)) throw new RuleException("Use JPG, PNG, WEBP, or private PDF files.");
        using var stream = new MemoryStream(); await file.CopyToAsync(stream); var bytes = stream.ToArray();
        var valid = extension switch { ".jpg" or ".jpeg" => bytes.Length > 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255, ".png" => bytes.Length > 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }), ".webp" => bytes.Length > 12 && System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP", ".pdf" => bytes.Length > 5 && System.Text.Encoding.ASCII.GetString(bytes, 0, 5) == "%PDF-", _ => false };
        if (!valid) throw new RuleException("File contents do not match the allowed format.");
        var record = new UploadRecord { OwnerId = owner, Private = confidential, ContentType = contentType }; record.Key = record.Id + extension;
        using var client = Client();
        if (client != null) { stream.Position = 0; await client.PutObjectAsync(new PutObjectRequest { BucketName = config[confidential ? "Storage:PrivateBucket" : "Storage:PublicBucket"], Key = record.Key, InputStream = stream, ContentType = contentType }); }
        else { Directory.CreateDirectory(Path.Combine(environment.ContentRootPath, "uploads")); await File.WriteAllBytesAsync(Path.Combine(environment.ContentRootPath, "uploads", record.Key), bytes); }
        db.Set<UploadRecord>().Add(record); await db.SaveChangesAsync(); return new { record.Id, Url = $"/api/v1/uploads/{record.Id}", record.Private };
    }
    public async Task<IResult> Read(string id, string userId, bool staff)
    {
        var record = await db.Set<UploadRecord>().SingleOrDefaultAsync(r => r.Id == id); if (record == null) return Results.NotFound();
        if (record.Private && !staff && record.OwnerId != userId) return Results.Forbid();
        using var client = Client();
        if (client != null) { using var obj = await client.GetObjectAsync(config[record.Private ? "Storage:PrivateBucket" : "Storage:PublicBucket"], record.Key); using var stream = new MemoryStream(); await obj.ResponseStream.CopyToAsync(stream); return Results.File(stream.ToArray(), record.ContentType); }
        var path = Path.Combine(environment.ContentRootPath, "uploads", record.Key); return File.Exists(path) ? Results.File(await File.ReadAllBytesAsync(path), record.ContentType) : Results.NotFound();
    }
}
