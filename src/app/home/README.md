# Home module

Documentación corta de la estructura real de `src/app/home`.

## Objetivo

Componer la vista principal autenticada en layout de 3 columnas.

## Componentes

- `home/home`
  - shell principal
  - renderiza `HomeHeader`, `HomeSidebar`, `HomeRightAside` y `router-outlet`

- `home-feed`
  - vista por defecto de `/home`
  - compone `CreatePostCard` + `PostList`

- `create-post`
  - formulario de creación en `/home/create-post`
  - reutilizado también para edición en `/home/edit-post/:id`

- `home-suggestions`
  - vista de sugerencias en `/home/suggestions`

- `post-detail` (fuera de carpeta `home`, pero usado como ruta hija)
  - detalle de publicación en `/home/post/:id`
  - reemplaza la zona central del feed manteniendo header/sidebar/aside

- `home-header`
  - branding, botón publicar, avatar, buscador de usuarios `@...`

- `home-sidebar`
  - filtros del feed y acceso directo a home

- `home-right-aside`
  - devs más activos
  - tags en tendencia
  - botón seguir y enlaces a perfiles

- `post-list`
  - lista de publicaciones, likes y comentarios
  - al abrir un post navega a `/home/post/:id`

- `create-post-card`
  - CTA/entrada rápida para publicar desde el feed
  - permite pre-rellenar contenido en `create-post` vía query param (`content`)

## Flujo

1. Router carga `Home`.
2. `Home` mantiene header/sidebar/aside fijos.
3. El `router-outlet` interno cambia entre `HomeFeed`, `CreatePost`, `HomeSuggestions` y `PostDetail` (`/home/post/:id`).
