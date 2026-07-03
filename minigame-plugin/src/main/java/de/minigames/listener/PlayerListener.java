package de.minigames.listener;

import de.minigames.MinigamePlugin;
import de.minigames.arena.Arena;
import de.minigames.arena.ArenaState;
import de.minigames.gamemode.ArrowWarsGame;
import de.minigames.gamemode.SkyWarsGame;
import de.minigames.gamemode.TntWarsGame;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerQuitEvent;

import java.util.Optional;

public class PlayerListener implements Listener {

    private final MinigamePlugin plugin;

    public PlayerListener(MinigamePlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();
        Optional<Arena> arenaOpt = plugin.getArenaManager().getArenaOfPlayer(player);
        if (arenaOpt.isEmpty()) return;

        Arena arena = arenaOpt.get();
        if (arena.getState() != ArenaState.INGAME) return;

        event.setDeathMessage(null); // Eigene Broadcast-Nachricht im jeweiligen Spielmodus

        // Respawn sofort (verhindert Standard-Respawn-Bildschirm in manchen Modi)
        event.getEntity().spigot().respawn();

        // An den richtigen Spielmodus delegieren
        if (arena.getActiveSession() instanceof SkyWarsGame g) {
            g.onPlayerDeath(player);
        } else if (arena.getActiveSession() instanceof TntWarsGame g) {
            g.onPlayerDeath(player);
        } else if (arena.getActiveSession() instanceof ArrowWarsGame g) {
            g.onPlayerDeath(player);
        }
    }

    @EventHandler
    public void onPlayerQuit(PlayerQuitEvent event) {
        Player player = event.getPlayer();
        plugin.getArenaManager().getArenaOfPlayer(player)
                .ifPresent(arena -> arena.removePlayer(player));
    }
}
