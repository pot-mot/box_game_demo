import type {AuthoredAttackClip} from './types.ts'

export const RANGED_CLIPS = {
    "longbow_shot": {
        "duration": 1.6,
        "supportHand": "authored",
        "times": [0, 0.48, 0.96, 1.6],
        "joints": {
            "rightArmShoulder": [[-1.1, 0.75, 0], [-1.1, 0.75, 0], [-1.1, 0.75, 0], [0.15, 0.45, 0]],
            "rightArmElbow": [[-0.5, 0, 0], [-0.5, 0, 0], [-0.5, 0, 0], [-2.1, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[3.033821, 0.652886, -0.000191], [3.033821, 0.652886, -0.000191], [3.033821, 0.652886, -0.000191], [-2.747647, -0.065046, 0.445593]],
            "leftArmShoulder": [[-0.1, -0.25, 0.55], [-0.05, -0.05, -0.2], [-0.05, -0.05, -0.2], [0, 0, 0]],
            "leftArmElbow": [[-1.8, 0, 0], [-2.75, 0, 0], [-2.75, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.699999, 0, 0], [1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [-0.029341, 0, 0], [-0.032141, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0.024441, 0, 0], [0.026781, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0.01956, 0, 0], [0.02142, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0.034222, 0, 0], [0.037502, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0.3, 0], [0.02, 0.35, 0], [0.02, 0.35, 0], [0, 0, 0]],
            "spine": [[0, -0.4, 0], [0, -0.4, 0], [0, -0.4, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.5, 0], [0, 0.5, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.16,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.36,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "crossbow_bolt": {
        "duration": 1.2,
        "times": [0, 0.36, 1.2],
        "joints": {
            "rightArmShoulder": [[0.48, 0.088, 0.575], [0.475, 0.163, 0.758], [-0.45, 0, 0]],
            "rightArmElbow": [[-1.878, 0, 0], [-1.973, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0.121, 0, 0], [0.078, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[3.351, 0, 0], [3.354, 0, 0], [1.7, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [-1.055099, 0.479839, -0.001179], [0, 0, 0]],
            "leftArmElbow": [[0, 0, 0], [-0.239914, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [-0.029401, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0.0245, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0.0196, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0.034302, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0, 0], [0.00704, 0.000013, 0.02066], [0, 0, 0]],
            "spine": [[0.05, -0.05, 0], [0.1, -0.05, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.4951, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.12,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.02,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shotgun_blast": {
        "duration": 2.4,
        "times": [0, 0.72, 2.4],
        "joints": {
            "rightArmShoulder": [[0.455, 0.044, 0.99], [0.413, 0.157, 1.212], [-0.45, 0, 0]],
            "rightArmElbow": [[-1.955, 0, 0], [-2.045, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0.174, 0, 0], [0.133, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[3.357, 0, 0], [3.355, 0, 0], [1.7, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [-1.092745, 0.496703, -0.000003], [0, 0, 0]],
            "leftArmElbow": [[0, 0, 0], [-0.248358, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [-0.030161, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0.025121, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0.0201, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0.035182, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0, 0], [0.013164, 0.000012, 0.047406], [0, 0, 0]],
            "spine": [[0.1, -0.05, 0], [0.15, -0.05, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.49497, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.24,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 2.04,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "staff_orb": {
        "duration": 2.4,
        "times": [0, 0.96, 2.4],
        "joints": {
            "rightArmShoulder": [[0.448, 0.314, 0.218], [0.058, 0.355, 0.639], [-0.45, 0, 0]],
            "rightArmElbow": [[-2.092, 0, 0], [-2.079, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[-0.039, 0, 0], [0.027, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.72, 0, 0], [3.107, 0, 0], [1.7, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [-1.098649, 0.499387, -0.000008], [0, 0, 0]],
            "leftArmElbow": [[0, 0, 0], [-0.249689, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [-0.030381, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0.025321, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0.02026, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0.035442, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0, 0], [0.016368, 0.000002, 0.063813], [0, 0, 0]],
            "spine": [[0.1, -0.05, 0], [0.2, -0.05, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.49494, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.24,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 2.04,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "magic_wand_homing": {
        "duration": 1.2,
        "times": [0, 0.36, 1.2],
        "joints": {
            "rightArmShoulder": [[0.455, 0.122, 0.375], [0.394, 0.122, 0.775], [-0.45, 0, 0]],
            "rightArmElbow": [[-2.059, 0, 0], [-2.074, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0.102, 0, 0], [0.16, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[3.348, 0, 0], [3.356, 0, 0], [1.7, 0, 0]],
            "leftArmShoulder": [[-0.25, 0, 0.15], [0.05, 0, 0.2], [0, 0, 0]],
            "leftArmElbow": [[-0.5, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [-0.029401, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0.0245, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0.0196, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0.034302, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0, 0], [0.00704, 0.000013, 0.02066], [0, 0, 0]],
            "spine": [[0.1, -0.05, 0], [0.15, -0.05, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.4951, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.12,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.02,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "throwing_axe_hurl": {
        "duration": 1.333333,
        "times": [0, 0.4, 1.333333],
        "joints": {
            "rightArmShoulder": [[-2.184, 0.3, -1.565], [-0.51, -0.258, 0.737], [-0.45, 0, 0]],
            "rightArmElbow": [[-1.243, 0, 0], [-1.6, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0.022, 0, 0], [0.256, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[3.194, 0, 0], [3.357, 0, 0], [1.7, 0, 0]],
            "leftArmShoulder": [[-0.5, 0, -0.2], [0.3, 0, 0.3], [0, 0, 0]],
            "leftArmElbow": [[-0.9, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [-0.030061, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0.025061, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0.02004, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0.035082, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0, 0], [0.011262, 0.000019, 0.038923], [0, 0, 0]],
            "spine": [[0, 0.1, 0], [0.25, -0.05, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.49499, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.133333,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.133333,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "grenade_throw": {
        "duration": 2.133333,
        "times": [0, 0.64, 2.133333],
        "joints": {
            "rightArmShoulder": [[-2.2, 0, -0.5], [-0.086, -0.136, 1.554], [-0.45, 0, 0]],
            "rightArmElbow": [[-1.3, 0, 0], [-1.872, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.251, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[3, 0, 0], [3.352, 0, 0], [1.7, 0, 0]],
            "leftArmShoulder": [[-0.5, 0, -0.2], [0.3, 0, 0.3], [0, 0, 0]],
            "leftArmElbow": [[-0.9, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [-0.030141, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0.025121, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0.0201, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0.035162, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0, 0], [0.016369, 0.000003, 0.063873], [0, 0, 0]],
            "spine": [[0, 0.1, 0], [0.25, -0.05, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.49498, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.213333,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.813333,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "molotov_throw": {
        "duration": 2.133333,
        "times": [0, 0.64, 2.133333],
        "joints": {
            "rightArmShoulder": [[-2.2, 0, -0.5], [-0.295, -0.135, 1.382], [-0.45, 0, 0]],
            "rightArmElbow": [[-1.4, 0, 0], [-1.869, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.244, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[3, 0, 0], [3.358, 0, 0], [1.7, 0, 0]],
            "leftArmShoulder": [[-0.5, 0, -0.2], [0.3, 0, 0.3], [0, 0, 0]],
            "leftArmElbow": [[-0.9, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [-0.030141, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0.025121, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0.0201, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0.035162, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0, 0], [0.016369, 0.000003, 0.063873], [0, 0, 0]],
            "spine": [[0, 0.1, 0], [0.25, -0.05, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.49498, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.213333,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.813333,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "throwing_dart_fling": {
        "duration": 0.8,
        "times": [0, 0.8],
        "joints": {
            "rightArmShoulder": [[-0.684, -0.176, 0.487], [-0.45, 0, 0]],
            "rightArmElbow": [[-1.459, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0.147, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[3.356, 0, 0], [1.7, 0, 0]],
            "leftArmShoulder": [[0.2, 0, 0.25], [0, 0, 0]],
            "leftArmElbow": [[-0.5, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.699999, 0, 0], [1.7, 0, 0]],
            "rightLegHip": [[0, 0, 0], [0, 0, 0]],
            "rightLegKnee": [[0, 0, 0], [0, 0, 0]],
            "leftLegHip": [[0, 0, 0], [0, 0, 0]],
            "leftLegKnee": [[0, 0, 0], [0, 0, 0]],
            "headNeck": [[0, 0, 0], [0, 0, 0]],
            "spine": [[0.2, -0.05, 0], [0, 0, 0]]
        },
        "positions": {
            "spine": [[0, 0.5, 0], [0, 0.5, 0]]
        },
        "events": [
            {
                "time": 0.08,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 0.68,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    }
} satisfies Readonly<Record<string, AuthoredAttackClip>>
