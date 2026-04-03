# Logica de Clasificacion del Catalogo B2B - Canal Tradicional

## Resumen

El catalogo agrupa productos en **familias** y **subgrupos** usando la categoria interna de Odoo (`product.category.complete_name`) como fuente de verdad. No depende de campos custom, tags, ni categorias publicas.

## Arquitectura

```
Odoo (product.product)
  └── categ_id → product.category.complete_name
        └── classifyProduct() en backend
              └── { family_key, family_label, subgroup_key, subgroup_label }
                    └── Frontend agrupa y renderiza
```

## Reglas de Clasificacion

### Familia LAURITA (sort_order 10-19)

| Regla | Subgrupo | Ejemplo de categ_id |
|-------|----------|---------------------|
| Ruta contiene "LAURITA" + "ROLITO" | Bolsa de Hielo Rolito | PRODUCTO TERMINADO / HIELO / ROLITO TRADICIONAL / LAURITA |
| Ruta contiene "GENERI" o "BARRA" (sin "KOLD") | Barras de Hielo | PRODUCTO TERMINADO / HIELO / BARRA DE HIELO / GENERICA |
| Ruta contiene "MOLIDO" (sin "KOLD") | Hielo Molido | PRODUCTO TERMINADO / HIELO / MOLIDO / GENERICO |
| Ruta contiene "LAURITA" (otros) | Otros Laurita | Cualquier otra con LAURITA |

### Familia KOLD (sort_order 20-29)

| Regla | Subgrupo | Ejemplo de categ_id |
|-------|----------|---------------------|
| Ruta contiene "CUP" | Kold Cup | PRODUCTO TERMINADO / CUPS / KOLD CUP |
| Ruta contiene "SMUTHIE" | Kold Smoothie | PRODUCTO TERMINADO / KOLD SMUTHIE |
| Ruta contiene "SORBET" | Kold Sorbet | PRODUCTO TERMINADO / SNACK / KOLD SORBET |
| Ruta contiene "SNACK" o "FRUIT" | Kold Snack & Fruits | PRODUCTO TERMINADO / SNACK / KOLD SNACK |
| Ruta contiene "HIELO" + "KOLD" | Hielo Kold | PRODUCTO TERMINADO / HIELO / ROLITO TRADICIONAL / KOLD |
| Ruta contiene "KOLD" (otros) | Otros Kold | Cualquier otra con KOLD |

### Familia OTROS (sort_order 90)

Productos cuya ruta de categoria no coincide con ninguna regla anterior.

## Ordenamiento

1. Por familia: LAURITA primero (Canal Tradicional), KOLD despues
2. Por subgrupo: segun sort_order asignado
3. Por peso: extrae KG del nombre del producto (`/\((\d+(?:\.\d+)?)\s*KG\)/i`)
4. Por nombre: alfabetico como fallback

## Filtros de Inclusion

- `sale_ok = true` (vendible)
- `qty_available > 0` (con stock)
- Categoria interna empieza con "PRODUCTO TERMINADO" (excluye materias primas, insumos)
- **NO filtra por `is_published`** — productos B2B incluyen barras/molido no publicados en ecommerce publico

## Precios

- Usa `lst_price` de `product.product` (respeta pricelist del contexto)
- Redondeado a 2 decimales en backend

## Limitaciones Actuales

1. **Clasificacion por convencion de nombres**: depende de que las categorias internas en Odoo contengan keywords como "LAURITA", "KOLD", "BARRA", "MOLIDO", etc. Si se renombra una categoria, el producto podria caer en OTROS.

2. **Sin campo de marca explicito**: Odoo no tiene campo `brand` o `x_studio_marca` en `product.template`. La marca se infiere de la ruta de categoria.

3. **Nombres de productos en Odoo**: algunos estan en ingles ("Frozen processed blackberry snack"), otros tienen typos ("MIX BERRIS"). La PWA los muestra tal cual vienen de Odoo.

4. **Categorias publicas vacias**: existen 3 (`Bolsa de Hielo`, `Kold Juice`, `Kold Cup`) pero ningun producto las tiene asignadas. No se usan.

5. **No hay combos reales**: los campos `x_is_combo`, `x_combo_id`, etc. son de KoldHome (B2C). Canal Tradicional no tiene combos configurados.

## Propuesta Futura: Taxonomia Explicita en Odoo

### Opcion recomendada: Tags

1. Crear tags en `product.tag`:
   - `Marca: KOLD`
   - `Marca: Laurita`
   - `Canal: Tradicional`

2. Asignar tags a cada producto desde Odoo

3. Modificar el endpoint para filtrar por tag `Canal: Tradicional` y agrupar por tag de marca

**Ventaja**: el equipo comercial controla la clasificacion directamente desde Odoo sin depender de desarrollo.

### Opcion alternativa: Campo custom

1. Crear `x_studio_marca` (selection: kold/laurita/otros) en `product.template`
2. Crear `x_studio_canal` (many2many: tradicional/b2c/ecommerce)

**Ventaja**: mas estructurado. **Desventaja**: requiere Odoo Studio y migracion de datos.

### Migracion

Cualquier opcion requiere:
- Asignar el tag/campo a los ~50 productos vendibles
- Modificar el endpoint para leer el nuevo campo en vez de inferir por categoria
- Mantener el mapeo actual como fallback durante la transicion

## Archivos Relevantes

- `src/app/api/catalog/route.ts` — endpoint + funcion `classifyProduct()`
- `src/app/(protected)/catalog/page.tsx` — UI con tabs de familia, acordeones de subgrupo
- `src/store/cart.ts` — carrito persistido en localStorage (Zustand)
