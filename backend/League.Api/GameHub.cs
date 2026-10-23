using Microsoft.AspNetCore.SignalR;
namespace League.Api;

public class GameHub : Hub
{
    public Task Watch(string gameId) => Groups.AddToGroupAsync(Context.ConnectionId, gameId);
    public Task Unwatch(string gameId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, gameId);
}
