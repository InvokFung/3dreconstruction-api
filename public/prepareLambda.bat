@REM pip install --target ./package boto3 --no-user
@REM pip install --target ./package pillow --no-user
@REM pip install --target ./package matplotlib --no-user
@REM pip install --target ./python opencv-python==4.5.3.56 --no-user
pip install --target ./python opencv-python==4.5.4.60 --no-user
@REM pip install --target ./python opencv-contrib-python --no-user
pip install --target ./python numpy --no-user
pip install --target ./python python-dotenv --no-user
pip install -t python/ opencv-python-headless==4.5.4.60 --no-user