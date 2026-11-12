/* Préparation des frontières dynamiques hors du fil principal (l'interface reste fluide). */
import { Morpher } from "./morph";

self.onmessage = (e: MessageEvent<{ id: number; A: GeoJSON.FeatureCollection; B: GeoJSON.FeatureCollection }>) => {
  const { id, A, B } = e.data;
  try {
    const m = new Morpher(A, B);
    (self as unknown as Worker).postMessage({ id, data: m.toData() });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message });
  }
};
