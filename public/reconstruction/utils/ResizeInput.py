from PIL import Image
import os

# Directory containing the images
directory = './train/bag/rgb'

# New dimensions
new_width = 640
new_height = 480

print("Resizing")
# Loop over all files in the directory
for filename in os.listdir(directory):
    # Check if the file is an image
    if filename.endswith('.jpg') or filename.endswith('.png'):
        # Open the image file
        img = Image.open(os.path.join(directory, filename))
        # Resize the image
        img_resized = img.resize((new_width, new_height), Image.NEAREST)
        # Save the resized image
        img_resized.save(os.path.join(directory, filename))
print("Resized")