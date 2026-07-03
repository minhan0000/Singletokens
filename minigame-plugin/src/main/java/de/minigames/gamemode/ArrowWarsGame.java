package de.minigames.gamemode;

import de.minigames.arena.Arena;
import de.minigames.kit.ArrowWarsKit;
import de.minigames.kit.KitManager;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Arrow Wars: Nur Bögen erlaubt. Meiste Kills gewinnen (oder letzter Überlebender).
 * Leben-System: jeder Spieler hat 3 Leben.
 */
public class ArrowWarsGame extends GameSession {

    private static final int LIVES = 3;

    private final Arena arena;
    private final Map<UUID, Integer> livesMap = new HashMap<>();

    public ArrowWarsGame(Arena arena) {
        this.arena = arena;
    }

    @Override
    protected void onStart() {
        for (int i = 0; i < players.size(); i++) {
            Player p = players.get(i);
            Location spawn = spawns.get(i % spawns.size());
            p.teleport(spawn);
            p.setGameMode(GameMode.SURVIVAL);
            p.getInventory().clear();
            KitManager.giveKit(p, new ArrowWarsKit());
            livesMap.put(p.getUniqueId(), LIVES);
            p.sendMessage("§aArrow Wars! Du hast §6" + LIVES + " Leben§a. Nur Bögen erlaubt!");
        }
    }

    public void onPlayerDeath(Player player) {
        int remaining = livesMap.getOrDefault(player.getUniqueId(), 0) - 1;
        livesMap.put(player.getUniqueId(), remaining);

        if (remaining <= 0) {
            livesMap.remove(player.getUniqueId());
            arena.broadcast("§c" + player.getName() + " §7hat keine Leben mehr und scheidet aus!");

            List<UUID> alive = livesMap.keySet().stream().toList();
            if (alive.size() == 1) {
                Player winner = players.stream()
                        .filter(p -> p.getUniqueId().equals(alive.get(0)))
                        .findFirst().orElse(null);
                arena.endGame(winner);
            } else if (alive.isEmpty()) {
                arena.endGame(null);
            }
        } else {
            // Respawn an einem freien Spawnpunkt
            Location respawn = spawns.get((int) (Math.random() * spawns.size()));
            player.teleport(respawn);
            player.sendMessage("§eNoch §6" + remaining + " Leben§e!");
            KitManager.giveKit(player, new ArrowWarsKit());
        }
    }

    @Override
    public void onPlayerLeave(Player player) {
        livesMap.remove(player.getUniqueId());
        List<UUID> alive = livesMap.keySet().stream().toList();
        if (alive.size() == 1) {
            Player winner = players.stream()
                    .filter(p -> p.getUniqueId().equals(alive.get(0)))
                    .findFirst().orElse(null);
            arena.endGame(winner);
        }
    }

    @Override
    public void end(Player winner) {
        for (Player p : players) {
            p.getInventory().clear();
            p.setGameMode(GameMode.SURVIVAL);
        }
        livesMap.clear();
    }
}
