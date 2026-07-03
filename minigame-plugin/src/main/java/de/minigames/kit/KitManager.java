package de.minigames.kit;

import org.bukkit.entity.Player;

public final class KitManager {
    private KitManager() {}

    public static void giveKit(Player player, Kit kit) {
        kit.apply(player);
    }
}
