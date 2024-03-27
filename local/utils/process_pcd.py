import open3d as o3d
import numpy as np
import cv2
import matplotlib.pyplot as plt
import os
import io
import math
from utils.posegraph_ICP import full_registration

import open3d as o3d

o3d.utility.set_verbosity_level(o3d.utility.VerbosityLevel.Error)

depth_scaling_factor = 1000
fx, fy = 520, 520
cx = 320
cy = 240


def generate_fragments(inputs, folder_paths):
    images = inputs["images"]
    depthMaps = inputs["depthMaps"]
    fragments = []

    for i in range(len(images)):
        fragment = generate_single_fragment(images[i], depthMaps[i])
        fragments.append(fragment)

    return fragments


def generate_single_fragment(image, depthMap):
    img = image

    min_val = np.min(depthMap)
    max_val = np.max(depthMap)
    depth = ((depthMap - min_val) * (255 / (max_val - min_val))).astype(np.uint8)
    # depth = (depthMap * 255 / np.max(depthMap)).astype('uint8')

    # Front
    threshold = 140
    # threshold = 200
    idx = np.where(depth > threshold)
    depth[idx] = 0

    # Back
    threshold = 60
    # threshold = 30
    idx = np.where(depth < threshold)
    depth[idx] = 0
    print("Depth Max:", depth.max())
    print("Depth Min:", depth.min())

    original_pcd = o3d.geometry.PointCloud()
    original_pcd_pos = []
    original_pcd_color = []

    # Ensure depth and img have the same dimensions
    if depth.shape != img.shape:
        depth = cv2.resize(depth, (img.shape[1], img.shape[0]))

    for v in range(img.shape[0]):  # height
        for u in range(img.shape[1]):  # width
            # Normalized image plane -> (u, v, 1) * z = zu, zv, z
            z = depth[v][u] / depth_scaling_factor  # mm
            x = (u - cx) * z / fx
            y = (v - cy) * z / fy
            # Fix upside down
            y = -y

            original_pcd_pos.append([x, y, z])
            original_pcd_color.append(img[v][u] / 255)
    # print(x, y, z)
    original_pcd_pos = np.array(original_pcd_pos, dtype=np.float32)
    original_pcd_pos = original_pcd_pos.reshape(-1, 3)
    original_pcd_color = np.array(original_pcd_color, dtype=np.float32)
    original_pcd_color = original_pcd_color.reshape(-1, 3)

    # Convert NumPy arrays to Open3D types
    original_pcd_points = o3d.utility.Vector3dVector(original_pcd_pos)
    original_pcd_colors = o3d.utility.Vector3dVector(original_pcd_color)

    # Assign the converted data to the point cloud
    original_pcd.points = original_pcd_points
    original_pcd.colors = original_pcd_colors

    # o3d.visualization.draw_geometries([original_pcd])

    down_pcd = original_pcd.voxel_down_sample(voxel_size=0.0002)
    # Default eps: 000005
    # Clustering
    # eps = 1.5  # 同一Cluster中點與點之間允許的最大距離
    # min_points = 50  # 每個Cluster至少有min_points個點才成立
    # eps = 0.004
    eps = 0.0045
    min_points = 500

    with o3d.utility.VerbosityContextManager(o3d.utility.VerbosityLevel.Debug) as cm:
        labels = np.array(down_pcd.cluster_dbscan(eps, min_points, print_progress=True))

    max_label = labels.max()
    print(f"point cloud has {max_label + 1} clusters")  # label = -1 : noise points

    # Extract Clustered point clouds
    cluster_pcd = o3d.geometry.PointCloud()
    cluster_pcd.points = o3d.utility.Vector3dVector(down_pcd.points)
    colors = plt.get_cmap("tab20")(labels / (max_label if max_label > 0 else 1))
    colors[labels < 0] = 0  # labels = -1 : noise cluster, display in color black
    cluster_pcd.colors = o3d.utility.Vector3dVector(colors[:, :3])
    # print("Displaying clustered point cloud")
    # o3d.visualization.draw_geometries([cluster_pcd])

    # Extract Interest point clouds
    frontier_indices = np.where(labels == 0)
    interest_pcd = o3d.geometry.PointCloud()
    interest_pcd.points = o3d.utility.Vector3dVector(
        np.asarray(down_pcd.points, np.float32)[frontier_indices]
    )
    interest_pcd.colors = o3d.utility.Vector3dVector(
        np.asarray(down_pcd.colors, np.float32)[frontier_indices]
    )
    # print("Displaying interest point cloud")
    # o3d.visualization.draw_geometries([interest_pcd])

    #
    # Assuming pcd is your point cloud
    centroid = interest_pcd.get_center()

    # Create a translation matrix
    trans = np.eye(4)
    trans[0:3, 3] = -centroid

    # Apply the translation to the point cloud
    interest_pcd.transform(trans)

    return interest_pcd


def register_fragments(inputs, folder_paths, fragments):
    pcds = []

    #
    voxel_size = 0.0005
    # voxel_size = 0.005
    #
    origin_pcds = fragments

    # o3d.visualization.draw_geometries(fragments)

    pcds_down = [pcd.voxel_down_sample(voxel_size) for pcd in fragments]

    # o3d.visualization.draw_geometries(pcds_down)

    # print("Applying full registration...")
    max_correspondence_distance_coarse = voxel_size * 15
    max_correspondence_distance_fine = voxel_size * 1
    with o3d.utility.VerbosityContextManager(o3d.utility.VerbosityLevel.Debug) as cm:
        pose_graph = full_registration(
            pcds_down,
            max_correspondence_distance_coarse,
            max_correspondence_distance_fine,
        )

    # print("Optimizing ICP posegraph...")
    option = o3d.pipelines.registration.GlobalOptimizationOption(
        max_correspondence_distance=max_correspondence_distance_fine,
        edge_prune_threshold=0.25,
        preference_loop_closure=2.0,
        reference_node=0,
    )
    with o3d.utility.VerbosityContextManager(o3d.utility.VerbosityLevel.Debug) as cm:
        o3d.pipelines.registration.global_optimization(
            pose_graph,
            o3d.pipelines.registration.GlobalOptimizationLevenbergMarquardt(),
            o3d.pipelines.registration.GlobalOptimizationConvergenceCriteria(),
            option,
        )

    # print("Transforming pcd and visualizing...")
    accumulated_pcd = o3d.geometry.PointCloud()
    for point_id in range(len(origin_pcds)):
        # accumulated_pcd += origin_pcds[point_id].transform(
        #     pose_graph.nodes[point_id].pose
        # )
        transformed_pcd = origin_pcds[point_id].transform(pose_graph.nodes[point_id].pose)
        accumulated_pcd.points.extend(transformed_pcd.points)
        accumulated_pcd.colors.extend(transformed_pcd.colors)
    # o3d.visualization.draw_geometries([accumulated_pcd])
        
    cl, ind = accumulated_pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=1.0)
    pcd_filtered = accumulated_pcd.select_by_index(ind)

    print("Saving pointclouds to numpy array...")
    # Convert Open3D point cloud to NumPy arrays for points and colors
    
    points = np.asarray(pcd_filtered.points)
    colors = np.asarray(pcd_filtered.colors)

    # Combine points and colors into a single NumPy array
    # Assuming both points and colors have the same number of elements
    point_cloud_data = np.hstack((points, colors))

    # pcd_bytes = pcd_array.tobytes()
    # # Create an in-memory bytes stream
    # pcd_stream = io.BytesIO(pcd_bytes)

    # Create a BytesIO object to store the NumPy array
    bytes_buffer = io.BytesIO()
    np.save(bytes_buffer, point_cloud_data)
    bytes_buffer.seek(0)  # Reset buffer position to the beginning

    
    s3 = inputs["s3"]
    bucketName = inputs["bucketName"]
    output_folder = folder_paths["output"]
    pcd_output_path = f"{output_folder}/accumulated_numpy.npy"
    s3.upload_fileobj(bytes_buffer, bucketName, pcd_output_path)
