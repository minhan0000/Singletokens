package de.minigames.arena;

import org.bukkit.scheduler.BukkitRunnable;

public class CountdownTask extends BukkitRunnable {

    private final Arena arena;
    private int secondsLeft;

    public CountdownTask(Arena arena, int seconds) {
        this.arena = arena;
        this.secondsLeft = seconds;
    }

    @Override
    public void run() {
        if (secondsLeft <= 0) {
            cancel();
            arena.startGame();
            return;
        }

        if (secondsLeft <= 5 || secondsLeft % 10 == 0) {
            arena.broadcast("§eSpiel startet in §6" + secondsLeft + " §eSekunden!");
        }
        secondsLeft--;
    }
}
