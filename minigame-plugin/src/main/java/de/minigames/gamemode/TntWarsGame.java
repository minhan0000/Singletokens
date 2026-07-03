package de.minigames.gamemode;

import de.minigames.arena.Arena;
import de.minigames.kit.KitManager;
import de.minigames.kit.TntWarsKit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;

/**
 * TNT Wars: Zwei Teams zerstören sich gegenseitig mit TNT.
 * Win-Condition: Alle Spieler des gegnerischen Teams sind tot.
 */
public class TntWarsGame extends GameSession {

    private final Arena arena;
    private final List<Player> teamA = new ArrayList<>();
    private final List<Player> teamB = new ArrayList<>();

    public TntWarsGame(Arena arena) {
        this.arena = arena;
    }

    @Override
    protected void onStart() {
        // Spieler gleichmäßig auf zwei Teams aufteilen
        for (int i = 0; i < players.size(); i++) {
            if (i % 2 == 0) teamA.add(players.get(i));
            else teamB.add(players.get(i));
        }

        assignAndTeleport(teamA, 0);
        assignAndTeleport(teamB, spawns.size() / 2);
    }

    private void assignAndTeleport(List<Player> team, int spawnOffset) {
        for (int i = 0; i < team.size(); i++) {
            Player p = team.get(i);
            Location spawn = spawns.get((spawnOffset + i) % spawns.size());
            p.teleport(spawn);
            p.setGameMode(GameMode.SURVIVAL);
            p.getInventory().clear();
            KitManager.giveKit(p, new TntWarsKit());
        }
        String teamName = (spawnOffset == 0) ? "§cRot" : "§9Blau";
        team.forEach(p -> p.sendMessage("§aTNT Wars! Du bist in Team " + teamName + "§a. Zerstöre das gegnerische Team!"));
    }

    public void onPlayerDeath(Player player) {
        boolean removedA = teamA.remove(player);
        boolean removedB = teamB.remove(player);

        if (removedA) arena.broadcast("§c" + player.getName() + " §7(Rot) ausgeschieden!");
        if (removedB) arena.broadcast("§9" + player.getName() + " §7(Blau) ausgeschieden!");

        if (teamA.isEmpty() && !teamB.isEmpty()) {
            arena.broadcast("§9Blaues Team §ahat gewonnen!");
            arena.endGame(teamB.get(0));
        } else if (teamB.isEmpty() && !teamA.isEmpty()) {
            arena.broadcast("§cRotes Team §ahat gewonnen!");
            arena.endGame(teamA.get(0));
        } else if (teamA.isEmpty() && teamB.isEmpty()) {
            arena.endGame(null);
        }
    }

    @Override
    public void onPlayerLeave(Player player) {
        onPlayerDeath(player);
    }

    @Override
    public void end(Player winner) {
        for (Player p : players) {
            p.getInventory().clear();
            p.setGameMode(GameMode.SURVIVAL);
        }
    }

    public boolean isSameTeam(Player a, Player b) {
        return (teamA.contains(a) && teamA.contains(b))
                || (teamB.contains(a) && teamB.contains(b));
    }
}
