import open3d as o3d
import numpy as np

# Load .npy file
data = np.load("./accumulated_numpy.npy").astype(np.float64)
# Create a point cloud from the loaded data
point_cloud = o3d.geometry.PointCloud()

# Access points
points = data[:, :3]

# Access colors
colors = data[:, 3:]

# Set the points of the point cloud
point_cloud.points = o3d.utility.Vector3dVector(points)
point_cloud.colors = o3d.utility.Vector3dVector(colors)

# Visualize the point cloud
o3d.visualization.draw_geometries([point_cloud])
