package de.minigames.arena;

import de.minigames.MinigamePlugin;
import de.minigames.gamemode.ArrowWarsGame;
import de.minigames.gamemode.GameSession;
import de.minigames.gamemode.SkyWarsGame;
import de.minigames.gamemode.TntWarsGame;
import de.minigames.util.SchematicUtil;
import org.bukkit.Location;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Arena {

    private final String id;
    private final String displayName;
    private final GameMode gameMode;
    private final String worldGuardRegion;
    private final String schematicFile;
    private final Location schematicOrigin;
    private final int minPlayers;
    private final int maxPlayers;
    private final List<Location> spawns;

    private ArenaState state = ArenaState.WAITING;
    private final List<Player> players = new ArrayList<>();
    private GameSession activeSession;

    public Arena(String id, String displayName, GameMode gameMode,
                 String worldGuardRegion, String schematicFile,
                 Location schematicOrigin, int minPlayers, int maxPlayers,
                 List<Location> spawns) {
        this.id = id;
        this.displayName = displayName;
        this.gameMode = gameMode;
        this.worldGuardRegion = worldGuardRegion;
        this.schematicFile = schematicFile;
        this.schematicOrigin = schematicOrigin;
        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;
        this.spawns = new ArrayList<>(spawns);
    }

    // --- Spieler-Verwaltung ---

    public boolean addPlayer(Player player) {
        if (state != ArenaState.WAITING && state != ArenaState.STARTING) return false;
        if (players.size() >= maxPlayers) return false;
        if (players.contains(player)) return false;

        players.add(player);

        if (players.size() >= minPlayers && state == ArenaState.WAITING) {
            startCountdown();
        }
        return true;
    }

    public void removePlayer(Player player) {
        players.remove(player);

        if (activeSession != null) {
            activeSession.onPlayerLeave(player);
        }

        if (state == ArenaState.STARTING && players.size() < minPlayers) {
            cancelCountdown();
        }

        if (state == ArenaState.INGAME && players.size() < 1) {
            endGame(null);
        }

        // Spieler zurück zur Lobby
        Location lobby = MinigamePlugin.getInstance().getArenaManager().getLobbySpawn();
        if (lobby != null) player.teleport(lobby);
    }

    // --- Spielfluss ---

    private CountdownTask countdownTask;

    private void startCountdown() {
        state = ArenaState.STARTING;
        int seconds = MinigamePlugin.getInstance().getConfig().getInt("settings.countdown-seconds", 30);
        countdownTask = new CountdownTask(this, seconds);
        countdownTask.runTaskTimer(MinigamePlugin.getInstance(), 0L, 20L);
    }

    private void cancelCountdown() {
        if (countdownTask != null) {
            countdownTask.cancel();
            countdownTask = null;
        }
        state = ArenaState.WAITING;
        broadcast("§cZu wenige Spieler – Countdown abgebrochen.");
    }

    public void startGame() {
        if (countdownTask != null) {
            countdownTask.cancel();
            countdownTask = null;
        }
        state = ArenaState.INGAME;

        activeSession = createSession();
        activeSession.start(new ArrayList<>(players), new ArrayList<>(spawns));
    }

    public void endGame(Player winner) {
        state = ArenaState.ENDING;

        if (activeSession != null) {
            activeSession.end(winner);
            activeSession = null;
        }

        if (winner != null) {
            broadcast("§6" + winner.getName() + " §ahat gewonnen!");
        }

        // Alle verbleibenden Spieler zur Lobby
        Location lobby = MinigamePlugin.getInstance().getArenaManager().getLobbySpawn();
        for (Player p : new ArrayList<>(players)) {
            if (lobby != null) p.teleport(lobby);
        }
        players.clear();

        resetSchematic();
    }

    private void resetSchematic() {
        state = ArenaState.RESETTING;
        SchematicUtil.pasteSchematic(schematicFile, schematicOrigin, () -> {
            state = ArenaState.WAITING;
            broadcast("§aArena zurückgesetzt – bereit für die nächste Runde!");
        });
    }

    private GameSession createSession() {
        return switch (gameMode) {
            case SKYWARS -> new SkyWarsGame(this);
            case TNTWARS -> new TntWarsGame(this);
            case ARROWWARS -> new ArrowWarsGame(this);
        };
    }

    public void broadcast(String message) {
        for (Player p : players) {
            p.sendMessage(message);
        }
    }

    public void shutdown() {
        if (countdownTask != null) countdownTask.cancel();
        if (activeSession != null) activeSession.end(null);
    }

    // --- Getter ---

    public String getId() { return id; }
    public String getDisplayName() { return displayName; }
    public GameMode getGameMode() { return gameMode; }
    public String getWorldGuardRegion() { return worldGuardRegion; }
    public String getSchematicFile() { return schematicFile; }
    public Location getSchematicOrigin() { return schematicOrigin; }
    public int getMinPlayers() { return minPlayers; }
    public int getMaxPlayers() { return maxPlayers; }
    public List<Location> getSpawns() { return Collections.unmodifiableList(spawns); }
    public ArenaState getState() { return state; }
    public List<Player> getPlayers() { return Collections.unmodifiableList(players); }
    public boolean isFull() { return players.size() >= maxPlayers; }
    public boolean isJoinable() { return state == ArenaState.WAITING || state == ArenaState.STARTING; }

    public void addSpawn(Location loc) { spawns.add(loc); }

    public GameSession getActiveSession() { return activeSession; }
}
