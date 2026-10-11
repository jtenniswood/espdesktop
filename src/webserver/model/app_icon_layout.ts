// Match firmware artwork alignment, excluding transparent canvas and faint shadows.
export function appIconArtworkBounds(alpha: Uint8Array, side: number): { left: number; top: number; right: number; bottom: number } {
    let peak = 0;
    for (const value of alpha) peak = Math.max(peak, value);
    if (!peak || side <= 0 || alpha.length !== side * side) return { left: 0, top: 0, right: 0, bottom: 0 };
    const threshold = Math.ceil(peak / 2);
    let left = side;
    let top = side;
    let right = side;
    let bottom = side;
    for (let index = 0; index < alpha.length; index++) {
        if ((alpha[index] ?? 0) < threshold) continue;
        left = Math.min(left, index % side);
        top = Math.min(top, Math.floor(index / side));
        right = Math.min(right, side - 1 - index % side);
        bottom = Math.min(bottom, side - 1 - Math.floor(index / side));
    }
    return { left, top, right, bottom };
}

export function appIconArtworkInsets(alpha: Uint8Array, side: number): { left: number; top: number } {
    const { left, top } = appIconArtworkBounds(alpha, side);
    return { left, top };
}
