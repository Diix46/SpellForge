import type { GameId } from '#shared/game'
import { collectionClient } from '~/utils/games/collection'

/**
 * Start what the 3D library needs while the collection is still being
 * fetched: three.js and the library's code, the scanned materials, the
 * spines' face. The bookcase then builds from the browser's caches instead of
 * waiting for them one after the other (Bookshelf.client.vue loads the same).
 */
export function warmBookshelf(game: GameId): void {
  if (!import.meta.client)
    return
  void Promise.all([
    import('three'),
    import('three/addons/geometries/RoundedBoxGeometry.js'),
    import('three/addons/utils/BufferGeometryUtils.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('~/utils/bookshelf/library'),
    import('~/utils/bookshelf/ambiance'),
  ]).catch(() => {})
  const dress = collectionClient(game).library
  for (const name of new Set(['leather', dress.wood, dress.wall])) {
    for (const k of ['', '_n', '_r']) {
      const img = new Image()
      img.decoding = 'async'
      img.src = `/textures/bookshelf/${name}${k}.jpg`
    }
  }
  void document.fonts?.load(`${dress.weight} 1px ${dress.face.split(',')[0]}`).catch(() => {})
}
