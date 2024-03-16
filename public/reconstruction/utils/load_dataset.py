import io
import os
import math
from matplotlib import pyplot as plt
from utils.depth_midas import renderDepthMap
import cv2


def savePlot(inputs, folder_paths):
    s3 = inputs["s3"]
    images = inputs["images"]
    depthMaps = inputs["depthMaps"]
    # Calculate the number of rows and columns for the grid
    num_images = len(images) + len(depthMaps)
    grid_size = math.ceil(math.sqrt(num_images))
    fig = plt.figure(figsize=(20, 20))

    # Display the images
    for i, image in enumerate(images, start=1):
        ax = fig.add_subplot(grid_size, grid_size, i)
        ax.imshow(image)
        ax.axis("off")  # Hide axes

    # Display the depth maps
    for i, depthMap in enumerate(depthMaps, start=len(images) + 1):
        ax = fig.add_subplot(grid_size, grid_size, i)
        ax.imshow(depthMap, cmap="gray")
        ax.axis("off")  # Hide axes

    # Save the plot to an in-memory bytes stream
    plot_stream = io.BytesIO()
    plt.savefig(plot_stream, format='png')
    plot_stream.seek(0)  # Rewind the stream
    
    bucketName = inputs["bucketName"]
    output_folder = folder_paths["output"]    
    plot_object_name = f"{output_folder}/preprocess.png"
    s3.upload_fileobj(plot_stream, bucketName, plot_object_name)


#
def load_rgb_images(input_folder):
    images = []
    images_names = []
    rgb_folder = os.path.join(input_folder, "rgb")

    print(f"Loading rgb images...")
    for filename in sorted(os.listdir(rgb_folder)):
        image_path = os.path.join(rgb_folder, filename)
        image = cv2.imread(image_path)
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        images.append(image)
        images_names.append(filename)
    return images, images_names


#
def generate_depthmaps(inputs):
    images = inputs["images"]

    depthMaps = []
    for i in range(len(images)):
        depthMap = renderDepthMap(images[i])
        depthMaps.append(depthMap)

    return depthMaps
