// Match firmware artwork alignment, excluding transparent canvas and faint shadows.
export function appIconArtworkInsets(alpha: Uint8Array, side: number): { left: number; top: number } {
    let peak = 0;
    for (const value of alpha) peak = Math.max(peak, value);
    if (!peak || side <= 0 || alpha.length !== side * side) return { left: 0, top: 0 };
    const threshold = Math.ceil(peak / 2);
    let left = side;
    let top = side;
    for (let index = 0; index < alpha.length; index++) {
        if ((alpha[index] ?? 0) < threshold) continue;
        left = Math.min(left, index % side);
        top = Math.min(top, Math.floor(index / side));
    }
    return { left, top };
}
