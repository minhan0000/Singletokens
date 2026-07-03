package de.minigames.util;

import com.sk89q.worldedit.EditSession;
import com.sk89q.worldedit.WorldEdit;
import com.sk89q.worldedit.bukkit.BukkitAdapter;
import com.sk89q.worldedit.extent.clipboard.Clipboard;
import com.sk89q.worldedit.extent.clipboard.io.ClipboardFormat;
import com.sk89q.worldedit.extent.clipboard.io.ClipboardFormats;
import com.sk89q.worldedit.extent.clipboard.io.ClipboardReader;
import com.sk89q.worldedit.function.operation.Operation;
import com.sk89q.worldedit.function.operation.Operations;
import com.sk89q.worldedit.math.BlockVector3;
import com.sk89q.worldedit.session.ClipboardHolder;
import de.minigames.MinigamePlugin;
import org.bukkit.Location;
import org.bukkit.scheduler.BukkitRunnable;

import java.io.File;
import java.io.FileInputStream;

public final class SchematicUtil {

    private SchematicUtil() {}

    /**
     * Fügt eine Schematic asynchron (Lesen) und danach synchron (Paste) in die Welt ein.
     * callback wird nach erfolgreichem Paste auf dem Hauptthread aufgerufen.
     */
    public static void pasteSchematic(String schematicPath, Location origin, Runnable callback) {
        File file = new File(MinigamePlugin.getInstance().getDataFolder().getParentFile()
                .getParentFile(), schematicPath);

        if (!file.exists()) {
            MinigamePlugin.getInstance().getLogger().warning("Schematic nicht gefunden: " + file.getPath());
            if (callback != null) {
                new BukkitRunnable() {
                    @Override public void run() { callback.run(); }
                }.runTask(MinigamePlugin.getInstance());
            }
            return;
        }

        new BukkitRunnable() {
            Clipboard clipboard;
            Exception error;

            @Override
            public void run() {
                // Asynchron: Schematic laden
                ClipboardFormat format = ClipboardFormats.findByFile(file);
                if (format == null) {
                    error = new IllegalArgumentException("Unbekanntes Schematic-Format: " + file.getName());
                    return;
                }
                try (ClipboardReader reader = format.getReader(new FileInputStream(file))) {
                    clipboard = reader.read();
                } catch (Exception e) {
                    error = e;
                }
            }

            // Paste auf Hauptthread
            public void pasteSync() {
                new BukkitRunnable() {
                    @Override
                    public void run() {
                        if (error != null || clipboard == null) {
                            MinigamePlugin.getInstance().getLogger().warning(
                                    "Fehler beim Laden der Schematic: " + (error != null ? error.getMessage() : "null"));
                            if (callback != null) callback.run();
                            return;
                        }
                        try (EditSession editSession = WorldEdit.getInstance().newEditSession(
                                BukkitAdapter.adapt(origin.getWorld()))) {
                            Operation operation = new ClipboardHolder(clipboard)
                                    .createPaste(editSession)
                                    .to(BlockVector3.at(origin.getX(), origin.getY(), origin.getZ()))
                                    .ignoreAirBlocks(false)
                                    .build();
                            Operations.complete(operation);
                        } catch (Exception e) {
                            MinigamePlugin.getInstance().getLogger().warning(
                                    "Fehler beim Einfügen der Schematic: " + e.getMessage());
                        }
                        if (callback != null) callback.run();
                    }
                }.runTask(MinigamePlugin.getInstance());
            }
        } {
            // Async starten, dann sync paten
            // Hinweis: BukkitRunnable.runTaskAsynchronously überschreibt run(); hier manueller Ablauf
        };

        // Vereinfachte, direkte Implementierung ohne verschachtelten anonymen Trick:
        MinigamePlugin.getInstance().getServer().getScheduler().runTaskAsynchronously(
                MinigamePlugin.getInstance(), () -> {
                    ClipboardFormat format = ClipboardFormats.findByFile(file);
                    if (format == null) {
                        scheduleCallback(callback);
                        return;
                    }
                    Clipboard clipboard;
                    try (ClipboardReader reader = format.getReader(new FileInputStream(file))) {
                        clipboard = reader.read();
                    } catch (Exception e) {
                        MinigamePlugin.getInstance().getLogger().warning("Schematic lesen fehlgeschlagen: " + e.getMessage());
                        scheduleCallback(callback);
                        return;
                    }

                    final Clipboard finalClipboard = clipboard;
                    MinigamePlugin.getInstance().getServer().getScheduler().runTask(
                            MinigamePlugin.getInstance(), () -> {
                                try (EditSession editSession = WorldEdit.getInstance().newEditSession(
                                        BukkitAdapter.adapt(origin.getWorld()))) {
                                    Operation operation = new ClipboardHolder(finalClipboard)
                                            .createPaste(editSession)
                                            .to(BlockVector3.at(origin.getBlockX(), origin.getBlockY(), origin.getBlockZ()))
                                            .ignoreAirBlocks(false)
                                            .build();
                                    Operations.complete(operation);
                                } catch (Exception e) {
                                    MinigamePlugin.getInstance().getLogger().warning("Schematic paste fehlgeschlagen: " + e.getMessage());
                                }
                                if (callback != null) callback.run();
                            });
                });
    }

    private static void scheduleCallback(Runnable callback) {
        if (callback == null) return;
        MinigamePlugin.getInstance().getServer().getScheduler()
                .runTask(MinigamePlugin.getInstance(), callback);
    }
}
