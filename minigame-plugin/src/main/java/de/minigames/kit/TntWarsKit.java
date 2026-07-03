package de.minigames.kit;

import org.bukkit.Material;
import org.bukkit.inventory.ItemStack;

import java.util.List;

public class TntWarsKit extends Kit {

    @Override
    public List<ItemStack> getItems() {
        return List.of(
                new ItemStack(Material.TNT, 8),
                new ItemStack(Material.FLINT_AND_STEEL),
                new ItemStack(Material.STONE_SWORD),
                new ItemStack(Material.COOKED_BEEF, 6)
        );
    }

    @Override
    public List<ItemStack> getArmor() {
        return List.of(
                new ItemStack(Material.IRON_HELMET),
                new ItemStack(Material.IRON_CHESTPLATE),
                new ItemStack(Material.IRON_LEGGINGS),
                new ItemStack(Material.IRON_BOOTS)
        );
    }
}
