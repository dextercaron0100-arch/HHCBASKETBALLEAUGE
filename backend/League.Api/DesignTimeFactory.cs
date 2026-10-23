using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace League.Api;

public class DesignTimeFactory : IDesignTimeDbContextFactory<LeagueDb>
{
    public LeagueDb CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<LeagueDb>().UseNpgsql("Host=localhost;Database=league;Username=league;Password=design-time-only").Options);
}
