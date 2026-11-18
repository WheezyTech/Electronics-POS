
@echo off
cd /d "C:\Users\admin\Pictures\Wheezy Don't Delete\ELECTRONICS_POS\backend"

call "C:\Users\admin\Pictures\Wheezy Don't Delete\ELECTRONICS_POS\backend\venv\Scripts\activate.bat"

waitress-serve --listen=0.0.0.0:8000 config.wsgi:application
