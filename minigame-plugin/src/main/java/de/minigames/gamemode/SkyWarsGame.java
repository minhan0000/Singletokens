package de.minigames.gamemode;

import de.minigames.arena.Arena;
import de.minigames.kit.KitManager;
import de.minigames.kit.SkyWarsKit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * SkyWars: Letzter Überlebender gewinnt.
 * Spieler spawnen auf einzelnen Inseln; wer fällt oder stirbt scheidet aus.
 */
public class SkyWarsGame extends GameSession {

    private final Arena arena;
    private final List<Player> alive = new ArrayList<>();

    public SkyWarsGame(Arena arena) {
        this.arena = arena;
    }

    @Override
    protected void onStart() {
        alive.clear();
        alive.addAll(players);

        for (int i = 0; i < players.size(); i++) {
            Player p = players.get(i);
            Location spawn = spawns.get(i % spawns.size());
            p.teleport(spawn);
            p.setGameMode(GameMode.SURVIVAL);
            p.getInventory().clear();
            KitManager.giveKit(p, new SkyWarsKit());
            p.sendMessage("§aSkyWars gestartet! Letzter Überlebender gewinnt.");
        }
    }

    /** Wird vom PlayerDeathListener aufgerufen. */
    public void onPlayerDeath(Player player) {
        alive.remove(player);
        arena.broadcast("§c" + player.getName() + " §7ist ausgeschieden! §e(" + alive.size() + " übrig)");

        if (alive.size() == 1) {
            arena.endGame(alive.get(0));
        } else if (alive.isEmpty()) {
            arena.endGame(null);
        }
    }

    @Override
    public void onPlayerLeave(Player player) {
        alive.remove(player);
        if (alive.size() == 1) {
            arena.endGame(alive.get(0));
        }
    }

    @Override
    public void end(Player winner) {
        for (Player p : players) {
            p.getInventory().clear();
            p.setGameMode(GameMode.SURVIVAL);
        }
    }

    public List<Player> getAlive() {
        return alive;
    }
}
