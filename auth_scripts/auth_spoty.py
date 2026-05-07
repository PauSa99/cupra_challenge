import requests
import webbrowser
from urllib.parse import urlencode

# CONFIGURACIÓN
CLIENT_ID = 'TU_CLIENT_ID'
CLIENT_SECRET = 'TU_CLIENT_SECRET'
REDIRECT_URI = 'http://127.0.0.1:8888/callback' # Asegúrate de que esté en tu Dashboard de Spotify
SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing'

def get_refresh_token():
    # 1. Obtener URL de autorización
    auth_url = "https://accounts.spotify.com/authorize?" + urlencode({
        'client_id': CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': REDIRECT_URI,
        'scope': SCOPES
    })
    
    print(f"Abriendo navegador para autorizar...\n{auth_url}")
    webbrowser.open(auth_url)
    
    # 2. El navegador te redirigirá a una URL que no carga (error 404), es NORMAL.
    # Copia esa URL completa aquí abajo.
    full_url = input("\nCopia y pega la URL completa a la que fuiste redirigido: ")
    code = full_url.split("code=")[1].split("&")[0]
    
    # 3. Intercambiar código por el Refresh Token
    response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': REDIRECT_URI,
            'client_id': CLIENT_ID,
            'client_secret': CLIENT_SECRET
        }
    )
    
    data = response.json()
    print("\n--- ¡ÉXITO! ---")
    print(f"Nuevo REFRESH_TOKEN: {data.get('refresh_token')}")
    print("Copia este valor en tu archivo .env")

if __name__ == "__main__":
    get_refresh_token()