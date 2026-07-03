package de.minigames.command;

import de.minigames.MinigamePlugin;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

public class LeaveCommand implements CommandExecutor {

    private final MinigamePlugin plugin;

    public LeaveCommand(MinigamePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, @NotNull String[] args) {

        if (!(sender instanceof Player player)) {
            sender.sendMessage("§cNur für Spieler.");
            return true;
        }

        plugin.getArenaManager().getArenaOfPlayer(player).ifPresentOrElse(
                arena -> {
                    arena.removePlayer(player);
                    player.sendMessage("§aDu hast die Arena verlassen.");
                },
                () -> player.sendMessage("§cDu bist in keiner Arena.")
        );
        return true;
    }
}
