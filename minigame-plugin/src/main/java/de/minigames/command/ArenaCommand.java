package de.minigames.command;

import de.minigames.MinigamePlugin;
import de.minigames.arena.Arena;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

/**
 * /arena list
 * /arena info <id>
 * /arena setspawn <id>   – setzt einen Spawnpunkt an die aktuelle Position
 * /arena reload
 */
public class ArenaCommand implements CommandExecutor {

    private final MinigamePlugin plugin;

    public ArenaCommand(MinigamePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, @NotNull String[] args) {

        if (!sender.hasPermission("minigames.admin")) {
            sender.sendMessage("§cKeine Berechtigung.");
            return true;
        }

        if (args.length == 0) {
            sendHelp(sender);
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "list" -> {
                sender.sendMessage("§e--- Arenen ---");
                for (Arena a : plugin.getArenaManager().getAllArenas()) {
                    sender.sendMessage("§7" + a.getId() + " §8| §f" + a.getDisplayName()
                            + " §8| §a" + a.getState() + " §8| §b" + a.getGameMode()
                            + " §8| §e" + a.getPlayers().size() + "/" + a.getMaxPlayers());
                }
            }
            case "info" -> {
                if (args.length < 2) { sender.sendMessage("§cUsage: /arena info <id>"); return true; }
                plugin.getArenaManager().getArena(args[1]).ifPresentOrElse(a -> {
                    sender.sendMessage("§e=== " + a.getDisplayName() + " ===");
                    sender.sendMessage("§7ID: §f" + a.getId());
                    sender.sendMessage("§7Modus: §f" + a.getGameMode());
                    sender.sendMessage("§7Status: §f" + a.getState());
                    sender.sendMessage("§7Spieler: §f" + a.getPlayers().size() + "/" + a.getMaxPlayers());
                    sender.sendMessage("§7Spawns: §f" + a.getSpawns().size());
                    sender.sendMessage("§7Region: §f" + a.getWorldGuardRegion());
                }, () -> sender.sendMessage("§cArena '" + args[1] + "' nicht gefunden."));
            }
            case "setspawn" -> {
                if (!(sender instanceof Player player)) { sender.sendMessage("§cNur für Spieler."); return true; }
                if (args.length < 2) { sender.sendMessage("§cUsage: /arena setspawn <id>"); return true; }
                plugin.getArenaManager().getArena(args[1]).ifPresentOrElse(a -> {
                    a.addSpawn(player.getLocation());
                    plugin.getArenaManager().saveArenaSpawns(a);
                    sender.sendMessage("§aSpawnpunkt #" + a.getSpawns().size() + " für '" + a.getId() + "' gesetzt.");
                }, () -> sender.sendMessage("§cArena '" + args[1] + "' nicht gefunden."));
            }
            case "reload" -> {
                plugin.reloadConfig();
                plugin.getArenaManager().loadArenas();
                sender.sendMessage("§aPlugin-Konfiguration neu geladen.");
            }
            default -> sendHelp(sender);
        }
        return true;
    }

    private void sendHelp(CommandSender sender) {
        sender.sendMessage("§e/arena list §7– Alle Arenen");
        sender.sendMessage("§e/arena info <id> §7– Arena-Details");
        sender.sendMessage("§e/arena setspawn <id> §7– Spawn setzen");
        sender.sendMessage("§e/arena reload §7– Config neu laden");
    }
}
