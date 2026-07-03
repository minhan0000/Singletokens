package de.minigames.kit;

import org.bukkit.Material;
import org.bukkit.inventory.ItemStack;

import java.util.List;

public class SkyWarsKit extends Kit {

    @Override
    public List<ItemStack> getItems() {
        return List.of(
                new ItemStack(Material.STONE_SWORD),
                new ItemStack(Material.BOW),
                new ItemStack(Material.ARROW, 16),
                new ItemStack(Material.COOKED_BEEF, 8),
                new ItemStack(Material.OAK_PLANKS, 32)
        );
    }

    @Override
    public List<ItemStack> getArmor() {
        return List.of(
                new ItemStack(Material.LEATHER_HELMET),
                new ItemStack(Material.LEATHER_CHESTPLATE),
                new ItemStack(Material.LEATHER_LEGGINGS),
                new ItemStack(Material.LEATHER_BOOTS)
        );
    }
}
