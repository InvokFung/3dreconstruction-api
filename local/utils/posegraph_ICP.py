import numpy as np
import open3d as o3d
import matplotlib.pyplot as plt


def pairwise_registration(
    source,
    target,
    init_trans,
    max_correspondence_distance_coarse,
    max_correspondence_distance_fine,
):

    source.estimate_normals()
    target.estimate_normals()

    # print("Apply point-to-plane ICP")
    icp_coarse = o3d.pipelines.registration.registration_icp(
        source,
        target,
        max_correspondence_distance_coarse,
        init_trans,
        o3d.pipelines.registration.TransformationEstimationPointToPlane(),
    )
    icp_fine = o3d.pipelines.registration.registration_icp(
        source,
        target,
        max_correspondence_distance_fine,
        icp_coarse.transformation,
        o3d.pipelines.registration.TransformationEstimationPointToPlane(),
    )
    transformation_icp = icp_fine.transformation
    information_icp = (
        o3d.pipelines.registration.get_information_matrix_from_point_clouds(
            source, target, max_correspondence_distance_fine, icp_fine.transformation
        )
    )
    return transformation_icp, information_icp


def full_registration(
    pcds_down, max_correspondence_distance_coarse, max_correspondence_distance_fine
):
    pose_graph = o3d.pipelines.registration.PoseGraph()
    odometry = np.identity(4)
    pose_graph.nodes.append(o3d.pipelines.registration.PoseGraphNode(odometry))
    n_pcds = len(pcds_down)
    for source_id in range(n_pcds):
        for target_id in range(source_id + 1, n_pcds):
            print("source id:", source_id)
            print("target id:", target_id)

            init_trans = np.identity(4)
            transformation_icp, information_icp = pairwise_registration(
                pcds_down[source_id],
                pcds_down[target_id],
                init_trans,
                max_correspondence_distance_coarse,
                max_correspondence_distance_fine
            )
            print("Build o3d.pipelines.registration.PoseGraph")
            if target_id == source_id + 1:  # odometry case

                odometry = np.dot((transformation_icp), odometry)

                pose_graph.nodes.append(
                    o3d.pipelines.registration.PoseGraphNode(np.linalg.inv(odometry))
                )
                pose_graph.edges.append(
                    o3d.pipelines.registration.PoseGraphEdge(
                        source_id,
                        target_id,
                        transformation_icp,
                        information_icp,
                        uncertain=False,
                    )
                )
            else:  # loop closure case -> connect any non-neighboring nodes
                pose_graph.edges.append(
                    o3d.pipelines.registration.PoseGraphEdge(
                        source_id,
                        target_id,
                        transformation_icp,
                        information_icp,
                        uncertain=True,
                    )
                )
    # Loop closure
    init_trans = np.identity(4)
    transformation_icp, information_icp = pairwise_registration(
        pcds_down[n_pcds - 1],
        pcds_down[0],
        init_trans,
        max_correspondence_distance_coarse,
        max_correspondence_distance_fine
    )
    pose_graph.edges.append(
        o3d.pipelines.registration.PoseGraphEdge(
            n_pcds - 1, 0, transformation_icp, information_icp, uncertain=False
        )
    )
    return pose_graph
