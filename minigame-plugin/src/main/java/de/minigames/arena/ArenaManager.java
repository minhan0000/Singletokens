package de.minigames.arena;

import de.minigames.MinigamePlugin;
import de.minigames.util.LocationUtil;
import org.bukkit.Location;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.*;

public class ArenaManager {

    private final MinigamePlugin plugin;
    private final Map<String, Arena> arenas = new LinkedHashMap<>();

    public ArenaManager(MinigamePlugin plugin) {
        this.plugin = plugin;
    }

    public void loadArenas() {
        arenas.clear();
        FileConfiguration config = plugin.getConfig();
        ConfigurationSection arenasSection = config.getConfigurationSection("arenas");
        if (arenasSection == null) return;

        for (String id : arenasSection.getKeys(false)) {
            ConfigurationSection sec = arenasSection.getConfigurationSection(id);
            if (sec == null) continue;

            try {
                GameMode gameMode = GameMode.valueOf(sec.getString("gamemode", "SKYWARS").toUpperCase());
                Location origin = LocationUtil.fromConfig(sec.getConfigurationSection("schematic-paste-origin"));
                List<Location> spawns = LocationUtil.listFromConfig(sec.getStringList("spawns"));

                Arena arena = new Arena(
                        id,
                        sec.getString("display-name", id),
                        gameMode,
                        sec.getString("worldguard-region", id),
                        sec.getString("schematic-file", "schematics/" + id + ".schem"),
                        origin,
                        sec.getInt("min-players", 2),
                        sec.getInt("max-players", 8),
                        spawns
                );
                arenas.put(id, arena);
                plugin.getLogger().info("Arena geladen: " + id + " (" + gameMode + ")");
            } catch (Exception e) {
                plugin.getLogger().warning("Fehler beim Laden der Arena '" + id + "': " + e.getMessage());
            }
        }
    }

    public void saveArenaSpawns(Arena arena) {
        List<String> serialized = LocationUtil.listToConfig(arena.getSpawns());
        plugin.getConfig().set("arenas." + arena.getId() + ".spawns", serialized);
        plugin.saveConfig();
    }

    public void shutdownAll() {
        arenas.values().forEach(Arena::shutdown);
    }

    public Optional<Arena> getArena(String id) {
        return Optional.ofNullable(arenas.get(id));
    }

    public Collection<Arena> getAllArenas() {
        return Collections.unmodifiableCollection(arenas.values());
    }

    public int getArenaCount() {
        return arenas.size();
    }

    /** Gibt die Arena zurück, in der der Spieler sich gerade befindet. */
    public Optional<Arena> getArenaOfPlayer(org.bukkit.entity.Player player) {
        return arenas.values().stream()
                .filter(a -> a.getPlayers().contains(player))
                .findFirst();
    }

    public Location getLobbySpawn() {
        return LocationUtil.fromConfig(plugin.getConfig().getConfigurationSection("settings.lobby-spawn"),
                plugin.getConfig().getString("settings.lobby-world", "world"));
    }
}
