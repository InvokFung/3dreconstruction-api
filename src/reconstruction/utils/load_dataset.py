import os
import math
from PIL import Image
from matplotlib import pyplot as plt
from utils.depth_midas import renderDepthMap
import cv2


def savePlot(images, depthMaps, output_folder):
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

    plt.savefig(f"{output_folder}/preprocess.png")


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
def load_depthMaps(input_folder, images, images_names):
    depthMaps = []
    depth_folder = os.path.join(input_folder, "depth")

    if not os.path.exists(depth_folder):
        print("Detected first time running, rendering depth maps...")

        os.makedirs(depth_folder, exist_ok=True)

        for i in range(len(images)):
            depthMap = renderDepthMap(images[i])
            saveName = os.path.join(depth_folder, images_names[i])
            plt.imsave(saveName, depthMap)
            depthMaps.append(depthMap)
    else:
        print("Detected folder existing, loading depth maps...")

        for filename in sorted(os.listdir(depth_folder)):
            image_path = os.path.join(depth_folder, filename)
            depthMap = cv2.imread(image_path)
            depthMaps.append(depthMap)

    return depthMaps


# ==================== Load dataset ====================
def preprocess_images(input_folder):
    images, images_names = load_rgb_images(input_folder)

    print(f"Done loading total {len(images)} images.")

    depthMaps = load_depthMaps(input_folder, images, images_names)

    print("Done loading all depth maps.")

    return images, images_names, depthMaps
