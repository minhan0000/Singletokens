package de.minigames.kit;

import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.inventory.ItemStack;

import java.util.List;

public class ArrowWarsKit extends Kit {

    @Override
    public List<ItemStack> getItems() {
        ItemStack bow = new ItemStack(Material.BOW);
        bow.addEnchantment(Enchantment.POWER, 2);
        bow.addEnchantment(Enchantment.INFINITY, 1);

        ItemStack arrow = new ItemStack(Material.ARROW, 1); // Infinity braucht nur 1 Pfeil

        return List.of(bow, arrow, new ItemStack(Material.COOKED_BEEF, 6));
    }

    @Override
    public List<ItemStack> getArmor() {
        return List.of(
                new ItemStack(Material.CHAINMAIL_HELMET),
                new ItemStack(Material.CHAINMAIL_CHESTPLATE),
                new ItemStack(Material.CHAINMAIL_LEGGINGS),
                new ItemStack(Material.CHAINMAIL_BOOTS)
        );
    }
}
