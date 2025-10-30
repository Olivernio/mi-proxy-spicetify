export const config = {
  runtime: 'edge',
};

export default async function (req) {
  // Obtenemos la URL de destino desde el parámetro 'url'
  const urlParam = new URL(req.url).searchParams.get('url');
  if (!urlParam) {
    return new Response('Falta el parámetro "url"', { status: 400 });
  }

  const targetUrl = decodeURIComponent(urlParam);
  
  // Cabeceras requeridas por Musixmatch
  const headers = new Headers();
  headers.set('User-Agent', req.headers.get('user-agent') || 'Spicetify');
  
  // ¡Clave! Musixmatch necesita estas cabeceras.
  // Las añadimos manualmente aquí.
  headers.set('Authority', 'apic-desktop.musixmatch.com');
  headers.set('Cookie', 'x-mxm-token-guid=');

  try {
    // Hacemos la petición a Musixmatch
    const response = await fetch(targetUrl, {
      headers: headers,
    });

    // Creamos una nueva respuesta, pero añadiendo la cabecera CORS
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, User-Agent, Cookie, Authority');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });

  } catch (error) {
    return new Response(error.message, { status: 500 });
  }
}
