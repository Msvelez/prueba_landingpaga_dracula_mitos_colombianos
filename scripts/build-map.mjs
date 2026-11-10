// Extrae el contorno de Colombia y sus vecinos desde world-atlas (Natural Earth 1:50m)
// y lo guarda en src/map-data.json para que la página no cargue el mapa mundial completo.
import { readFile, writeFile } from 'node:fs/promises';
import { feature } from 'topojson-client';

const topo = JSON.parse(await readFile(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url), 'utf8'));
const { features } = feature(topo, topo.objects.countries);
const byId = (id) => features.find((f) => f.id === id);
const polygons = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const round = (ring) => ring.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);

const COLOMBIA = '170';
const NEIGHBORS = ['862', '218', '604', '076', '591']; // Venezuela, Ecuador, Perú, Brasil, Panamá

const out = {
  colombia: polygons(byId(COLOMBIA).geometry).map((p) => round(p[0])),
  neighbors: NEIGHBORS.map((id) => ({
    name: byId(id).properties.name,
    rings: polygons(byId(id).geometry).map((p) => round(p[0])),
  })),
};

await writeFile(new URL('../src/map-data.json', import.meta.url), JSON.stringify(out));
console.log(`Colombia: ${out.colombia.length} polígonos, ${out.colombia.reduce((n, r) => n + r.length, 0)} puntos`);
console.log(`Vecinos: ${out.neighbors.map((n) => n.name).join(', ')}`);
