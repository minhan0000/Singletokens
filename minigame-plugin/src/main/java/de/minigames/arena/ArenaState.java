package de.minigames.arena;

public enum ArenaState {
    WAITING,    // Warte auf Spieler
    STARTING,   // Countdown läuft
    INGAME,     // Spiel läuft
    ENDING,     // Spiel beendet, Schematic wird zurückgesetzt
    RESETTING   // Schematic-Reset läuft
}
