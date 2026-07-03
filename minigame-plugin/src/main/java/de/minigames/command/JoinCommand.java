package de.minigames.command;

import de.minigames.MinigamePlugin;
import de.minigames.arena.Arena;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

public class JoinCommand implements CommandExecutor {

    private final MinigamePlugin plugin;

    public JoinCommand(MinigamePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, @NotNull String[] args) {

        if (!(sender instanceof Player player)) {
            sender.sendMessage("§cNur für Spieler.");
            return true;
        }

        if (args.length == 0) {
            player.sendMessage("§cUsage: /join <arena-id>");
            return true;
        }

        // Spieler darf nur in einer Arena gleichzeitig sein
        if (plugin.getArenaManager().getArenaOfPlayer(player).isPresent()) {
            player.sendMessage("§cDu bist bereits in einer Arena. Verwende /leave zuerst.");
            return true;
        }

        String arenaId = args[0].toLowerCase();
        Arena arena = plugin.getArenaManager().getArena(arenaId).orElse(null);

        if (arena == null) {
            player.sendMessage("§cArena '" + arenaId + "' nicht gefunden.");
            return true;
        }

        if (!arena.isJoinable()) {
            player.sendMessage("§cDiese Arena ist gerade nicht beitrittsfähig (Status: " + arena.getState() + ").");
            return true;
        }

        if (arena.isFull()) {
            player.sendMessage("§cDiese Arena ist voll (" + arena.getMaxPlayers() + "/" + arena.getMaxPlayers() + ").");
            return true;
        }

        boolean joined = arena.addPlayer(player);
        if (joined) {
            player.sendMessage("§aDu bist §e" + arena.getDisplayName() + " §abeigetreten! ("
                    + arena.getPlayers().size() + "/" + arena.getMaxPlayers() + ")");
            arena.broadcast("§e" + player.getName() + " §7ist beigetreten. ("
                    + arena.getPlayers().size() + "/" + arena.getMaxPlayers() + ")");
        } else {
            player.sendMessage("§cBeitreten fehlgeschlagen.");
        }
        return true;
    }
}
