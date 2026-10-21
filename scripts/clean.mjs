import { rmSync } from 'node:fs';

// Eliminar también el compilado de módulos retirados.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
