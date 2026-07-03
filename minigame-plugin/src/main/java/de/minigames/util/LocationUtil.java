package de.minigames.util;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.configuration.ConfigurationSection;

import java.util.ArrayList;
import java.util.List;

public final class LocationUtil {

    private LocationUtil() {}

    public static Location fromConfig(ConfigurationSection sec) {
        return fromConfig(sec, null);
    }

    public static Location fromConfig(ConfigurationSection sec, String defaultWorld) {
        if (sec == null) return null;
        String worldName = sec.getString("world", defaultWorld);
        return new Location(
                Bukkit.getWorld(worldName),
                sec.getDouble("x", 0),
                sec.getDouble("y", 64),
                sec.getDouble("z", 0),
                (float) sec.getDouble("yaw", 0),
                (float) sec.getDouble("pitch", 0)
        );
    }

    /** Serialisiert eine Location als "world:x:y:z:yaw:pitch" */
    public static String serialize(Location loc) {
        return loc.getWorld().getName() + ":" + loc.getX() + ":" + loc.getY() + ":"
                + loc.getZ() + ":" + loc.getYaw() + ":" + loc.getPitch();
    }

    public static Location deserialize(String s) {
        String[] parts = s.split(":");
        return new Location(
                Bukkit.getWorld(parts[0]),
                Double.parseDouble(parts[1]),
                Double.parseDouble(parts[2]),
                Double.parseDouble(parts[3]),
                Float.parseFloat(parts[4]),
                Float.parseFloat(parts[5])
        );
    }

    public static List<Location> listFromConfig(List<String> raw) {
        List<Location> result = new ArrayList<>();
        for (String s : raw) {
            try { result.add(deserialize(s)); } catch (Exception ignored) {}
        }
        return result;
    }

    public static List<String> listToConfig(List<Location> locs) {
        List<String> result = new ArrayList<>();
        for (Location loc : locs) result.add(serialize(loc));
        return result;
    }
}
