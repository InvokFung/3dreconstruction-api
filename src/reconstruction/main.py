import os
import sys
import logging
from PIL import Image
import matplotlib.pyplot as plt
from datetime import datetime
from utils.load_dataset import preprocess_images, savePlot
from utils.process_pcd import generate_fragments, register_fragments


def process_image(input_folder, output_folder):
    #
    print("Processing images and depth maps...")
    images, images_names, depthMaps = preprocess_images(input_folder)
    print("Done processing images and depth maps.")

    #
    savePlot(images, depthMaps, output_folder)

    #
    print("Generating PCD fragments...")
    fragments = generate_fragments(images, depthMaps, input_folder, images_names)
    print("Done generating PCD fragments.")

    #
    print("Registering PCD fragments...")
    pcd = register_fragments(fragments, output_folder)
    print("Done registering PCD fragments.")

    output_image_path = f"{output_folder}/output.png"

    # img.save(output_image_path)

    # print(f"Result path: {output_image_path}")  # Print the path of the output imag

    # Get the parent directory of the current file
    parent_dir_path = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    image_path = os.path.join(parent_dir_path, "success.png")

    # Debug
    print(f"Result path: {image_path}")


if __name__ == "__main__":

    userId = sys.argv[1]

    # Default parameters
    depthMin = 0
    depthMax = 100
    fx = 1000
    fy = 1000
    cx = 320
    cy = 247

    for i in range(2, len(sys.argv)):
        if sys.argv[i] == "--depthMin" and float(sys.argv[i + 1]) != 0:
            depthMin = float(sys.argv[i + 1])
        elif sys.argv[i] == "--depthMax" and float(sys.argv[i + 1]) != 0:
            depthMax = float(sys.argv[i + 1])
        elif sys.argv[i] == "--fx" and float(sys.argv[i + 1]) != 0:
            fx = float(sys.argv[i + 1])
        elif sys.argv[i] == "--fy" and float(sys.argv[i + 1]) != 0:
            fy = float(sys.argv[i + 1])
        elif sys.argv[i] == "--cx" and float(sys.argv[i + 1]) != 0:
            cx = float(sys.argv[i + 1])
        elif sys.argv[i] == "--cy" and float(sys.argv[i + 1]) != 0:
            cy = float(sys.argv[i + 1])

    print(
        f"depthMin: {depthMin}, depthMax: {depthMax}, fx: {fx}, fy: {fy}, cx: {cx}, cy: {cy}"
    )

    # Get user input images folder path
    parent_dir_path = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    input_folder = os.path.join(parent_dir_path, "tmpImages", userId)

    create_time = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")

    # Ensure the user output folder ready
    output_dir = os.path.join(parent_dir_path, "output", userId)
    os.makedirs(output_dir, exist_ok=True)
    output_dir = os.path.join(output_dir, create_time)
    os.makedirs(output_dir, exist_ok=True)

    output_folder = f"output/{userId}/{create_time}"
    log_file_name = f"{output_folder}/history.log"
    logging.basicConfig(filename=log_file_name, level=logging.INFO)
    logging.info(f"Starting the program for user {userId}...")
    process_image(input_folder, output_folder)
