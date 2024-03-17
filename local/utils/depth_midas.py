import numpy as np
import cv2
import torch

model = None
device = None
transform = None

def initialize():
    global model, device, transform

    model_type = "DPT_Large"
    model = torch.hub.load("intel-isl/MiDaS", model_type)
    model.eval()

    device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    model.to(device)

    midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
    transform = midas_transforms.dpt_transform    

def renderDepthMap(imageObj):
    global model, device, transform

    # Check if the model is initialized
    if model is None or device is None or transform is None:
        initialize()

    # image is an object of PIL Image
    image = np.array(imageObj)
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    input_batch = transform(image).to(device)
    with torch.no_grad():
        predicted_depth = model(input_batch)

        predicted_depth = torch.nn.functional.interpolate(
            predicted_depth.unsqueeze(1),
            size=image.shape[:2],
            mode="bicubic",
            align_corners=False,
        ).squeeze()

        output = predicted_depth.cpu().numpy() * 1000
    return output