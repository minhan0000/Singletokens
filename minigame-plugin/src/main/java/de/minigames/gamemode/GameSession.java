package de.minigames.gamemode;

import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.List;

/** Abstrakte Basisklasse für eine laufende Spielinstanz in einer Arena. */
public abstract class GameSession {

    protected List<Player> players;
    protected List<Location> spawns;

    public final void start(List<Player> players, List<Location> spawns) {
        this.players = players;
        this.spawns = spawns;
        onStart();
    }

    protected abstract void onStart();

    public abstract void onPlayerLeave(Player player);

    /** Beendet die Session. winner == null bedeutet kein Gewinner (z.B. alle Spieler weg). */
    public abstract void end(Player winner);
}
