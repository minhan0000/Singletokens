package de.minigames.kit;

import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.List;

public abstract class Kit {
    public abstract List<ItemStack> getItems();
    public abstract List<ItemStack> getArmor();

    public void apply(Player player) {
        player.getInventory().clear();
        for (ItemStack item : getItems()) {
            player.getInventory().addItem(item);
        }
        List<ItemStack> armor = getArmor();
        if (!armor.isEmpty()) {
            // Slot-Reihenfolge: Helm, Brust, Beine, Schuhe
            if (armor.size() > 0) player.getInventory().setHelmet(armor.get(0));
            if (armor.size() > 1) player.getInventory().setChestplate(armor.get(1));
            if (armor.size() > 2) player.getInventory().setLeggings(armor.get(2));
            if (armor.size() > 3) player.getInventory().setBoots(armor.get(3));
        }
        player.updateInventory();
    }
}
