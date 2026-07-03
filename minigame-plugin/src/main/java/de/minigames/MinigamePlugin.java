package de.minigames;

import de.minigames.arena.ArenaManager;
import de.minigames.command.ArenaCommand;
import de.minigames.command.JoinCommand;
import de.minigames.command.LeaveCommand;
import de.minigames.listener.PlayerListener;
import org.bukkit.plugin.java.JavaPlugin;

public final class MinigamePlugin extends JavaPlugin {

    private static MinigamePlugin instance;
    private ArenaManager arenaManager;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();

        arenaManager = new ArenaManager(this);
        arenaManager.loadArenas();

        registerCommands();
        registerListeners();

        getLogger().info("MinigamePlugin aktiviert – " + arenaManager.getArenaCount() + " Arenen geladen.");
    }

    @Override
    public void onDisable() {
        if (arenaManager != null) {
            arenaManager.shutdownAll();
        }
        getLogger().info("MinigamePlugin deaktiviert.");
    }

    private void registerCommands() {
        getCommand("arena").setExecutor(new ArenaCommand(this));
        getCommand("join").setExecutor(new JoinCommand(this));
        getCommand("leave").setExecutor(new LeaveCommand(this));
    }

    private void registerListeners() {
        getServer().getPluginManager().registerEvents(new PlayerListener(this), this);
    }

    public static MinigamePlugin getInstance() {
        return instance;
    }

    public ArenaManager getArenaManager() {
        return arenaManager;
    }
}
