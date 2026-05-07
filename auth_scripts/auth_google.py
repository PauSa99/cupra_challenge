import webbrowser
from google_auth_oauthlib.flow import InstalledAppFlow

# ==========================================
# CONFIGURACIÓN (Rellena estos datos)
# ==========================================
CLIENT_ID = "TU_CLIENT_ID_DE_GOOGLE_CLOUD"
CLIENT_SECRET = "TU_CLIENT_SECRET_DE_GOOGLE_CLOUD"

# Scopes para Calendar y Gmail
SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.send'
]

def get_google_refresh_token():
    # Creamos la configuración directamente con las variables
    client_config = {
        "installed": {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }

    # Iniciamos el flujo de autenticación
    flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
    
    # Esto abrirá el navegador automáticamente
    # port=0 busca cualquier puerto libre en tu PC
    creds = flow.run_local_server(port=0, prompt='consent')

    print("\n" + "="*40)
    print("¡AUTENTICACIÓN COMPLETADA CON ÉXITO!")
    print("="*40)
    print(f"\nTu REFRESH_TOKEN es:\n\n{creds.refresh_token}")
    print("\n" + "="*40)
    print("Copia este valor en tu archivo .env")

if __name__ == "__main__":
    get_google_refresh_token()