import os
from studio.config import load_env

load_env()

from studio.app import create_app

app=create_app()
if __name__=='__main__':
    app.run(host=os.getenv('STUDIO_HOST','127.0.0.1'),port=7860,debug=False,threaded=True,load_dotenv=False)
