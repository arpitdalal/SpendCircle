/** Hard cap on occupied seats (active Members + unexpired pending Invitations) per Circle. */
export const CIRCLE_CAPACITY_LIMIT = 256;

export function remainingCircleSeats(occupiedSeats: number) {
  return Math.max(0, CIRCLE_CAPACITY_LIMIT - occupiedSeats);
}

export function isCircleAtCapacity(occupiedSeats: number) {
  return occupiedSeats >= CIRCLE_CAPACITY_LIMIT;
}
