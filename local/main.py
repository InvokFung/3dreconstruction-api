from dotenv import load_dotenv
import io
import os
import sys
import logging
from PIL import Image
import matplotlib.pyplot as plt
from datetime import datetime
from utils.load_dataset import generate_depthmaps, savePlot
from utils.process_pcd import generate_fragments, register_fragments
import boto3
import numpy as np
import cv2

load_dotenv()

s3 = boto3.client(
    "s3",
    region_name=os.getenv("AWS_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)


def process_image(inputs, folder_paths):
    #
    logging.info("Processing images and depth maps...")
    depthMaps = generate_depthmaps(inputs)
    inputs["depthMaps"] = depthMaps
    logging.info("Done processing images and depth maps.")
    print(f"main_progress:40")

    #
    logging.info("Saving preprocessing plot...")
    savePlot(inputs, folder_paths)
    logging.info("Done saving preprocessing plot.")
    print(f"main_progress:45")

    #
    logging.info("Generating PCD fragments...")
    fragments = generate_fragments(inputs, folder_paths)
    logging.info("Done generating PCD fragments.")
    print(f"main_progress:70")

    #
    logging.info("Registering PCD fragments...")
    register_fragments(inputs, folder_paths, fragments)
    logging.info("Done registering PCD fragments.")


def read_images_from_s3_folder(bucketName, folder):
    objects = s3.list_objects_v2(Bucket=bucketName, Prefix=folder)
    images = []
    images_names = []

    for obj in objects["Contents"]:
        try:

            response = s3.get_object(Bucket=bucketName, Key=obj["Key"])
            image_content = response["Body"].read()
            print(f"Reading image from s3: {obj['Key']}")

            # Convert the image_content from byte stream to numpy array
            nparr = np.frombuffer(image_content, np.uint8)

            # Decode the numpy array as image
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # image_display = Image.open(io.BytesIO(image_content))
            # plt.imshow(image_display)
            # plt.show()

            images.append(image)
            images_names.append(obj["Key"])
        except:
            continue

    return images, images_names


def startMain():
    userId = sys.argv[1]
    projectId = sys.argv[2]
    # userId = 1
    # projectId = 1

    # Default parameters
    params = {}
    # params = {
    #     "depthMin": 60,
    #     "depthMax": 140,
    #     "fx": 520,
    #     "fy": 520,
    #     "cx": 320,
    #     "cy": 240,
    # }

    bucketName = os.getenv("AWS_BUCKET_NAME")

    project_folder = f"user-{userId}/{projectId}"
    input_folder = f"{project_folder}/rgb"
    output_folder = f"{project_folder}/output"

    images, images_names = read_images_from_s3_folder(bucketName, input_folder)

    print(f"main_progress:30")

    print(f"Loading params...")

    # Read command line arguments
    for i in range(3, len(sys.argv), 2):
        arg = sys.argv[i]
        if arg.startswith("--"):
            param_name = arg[2:]
            if float(sys.argv[i + 1]) != -1:
                params[param_name] = float(sys.argv[i + 1])

    print(params)

    # Print parameters
    for name, value in params.items():
        default_str = " (default)" if value == params[name] else ""
        print(f"{name}: {value}{default_str}")

    log_output_path = f"{output_folder}/history.log"
    log_stream = io.StringIO()
    logging.basicConfig(stream=log_stream, level=logging.INFO)
    logging.info(f"Starting the program for user {userId}...")

    inputs = {
        "s3": s3,
        "bucketName": bucketName,
        "images": images,
        "images_names": images_names,
        "params": params,
    }

    folder_paths = {
        "project": project_folder,
        "input": input_folder,
        "output": output_folder,
    }

    print(f"main_progress:35")
    process_image(inputs, folder_paths)
    print(f"main_progress:90")

    logging.info(f"Program finished for user {userId}...")
    # Get the log contents
    log_contents = log_stream.getvalue()
    # Convert log contents to bytes
    log_bytes = log_contents.encode()
    # Create an in-memory bytes stream
    log_bytes_stream = io.BytesIO(log_bytes)
    s3.upload_fileobj(log_bytes_stream, bucketName, log_output_path)
    print(f"main_progress:95")


if __name__ == "__main__":
    start_message = input()
    if start_message == "start":
        startMain()
