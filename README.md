# Bubble Shooter Web

A lightweight modern Bubble Shooter game implemented with vanilla HTML5 Canvas + JavaScript. No frameworks, minimal footprint.

## Features
- Smooth shooting & wall bounces
- Hex-like staggered grid
- Cluster popping (3+ same color)
- Floating (disconnected) bubble drop
- Periodic new top row pressure
- Score, shot counter, live rows display
- Mouse & touch support
- Responsive + modern UI styling (CSS only)

## How to Run
Just open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge). No build step required.

## Controls
- Move mouse / drag finger to aim
- Click / tap to shoot
- Match 3 or more of the same color to clear
- Prevent bubbles from descending near the shooter area

## Structure
```
index.html   # App shell & canvas
styles.css   # Modern dark UI styling
game.js      # Game logic & rendering loop
```

## Possible Improvements
- Sound effects (pop, bounce)
- Color probability balancing based on remaining colors
- High score persistence (localStorage)
- Power-ups (bomb, color change)
- Animated removal & drop physics

## License
MIT
