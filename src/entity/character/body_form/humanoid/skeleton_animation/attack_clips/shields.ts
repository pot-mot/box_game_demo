import type {AuthoredAttackClip} from './types.ts'

export const SHIELD_CLIPS = {
    "shield_small_one_handed_light_1": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1, -0.15, -0.5], [0.35, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.5, 0, 0], [-0.4, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.12, 0, 0], [-0.05, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.9, 0, 0], [1.65, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.3, 0, 0.3], [0.1, 0, 0.15], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.6, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, -0.15, 0], [0.2, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_small_one_handed_light_2": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-0.6, 0.4, -0.3], [-0.25, -0.5, 0.2], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.3, 0, 0], [-0.6, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [-0.1, 0, 0], [0.06, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.8, 0, 0], [1.7, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.2, 0, -0.15], [0.05, 0, 0.25], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.5, 0, 0], [-0.45, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, 0.2, 0], [0.2, -0.2, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_small_one_handed_heavy_1": {
        "duration": 2.64,
        "times": [0, 0.96, 1.44, 2.64],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1.3, -0.1, -0.6], [0.55, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.9, 0, 0], [-0.3, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.16, 0, 0], [-0.1, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [2, 0, 0], [1.6, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.35, 0, 0.35], [0.1, 0, 0.2], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.7, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.15, -0.2, 0], [0.35, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1.2,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.416,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_small_one_handed_heavy_2": {
        "duration": 2.64,
        "times": [0, 0.96, 1.44, 2.64],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-0.9, 0.2, -0.2], [-1.55, -0.3, 0.3], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.6, 0, 0], [-0.5, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.1, 0, 0], [-0.12, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.8, 0, 0], [2.2, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.25, 0, -0.1], [0.15, 0, 0.2], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.55, 0, 0], [-0.45, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, 0.15, 0], [0.1, -0.1, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1.2,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.416,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_small_one_handed_air_1": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1, -0.15, -0.5], [0.35, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.5, 0, 0], [-0.4, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.12, 0, 0], [-0.05, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.9, 0, 0], [1.65, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.3, 0, 0.3], [0.1, 0, 0.15], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.6, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, -0.15, 0], [0.2, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_medium_one_handed_light_1": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1, -0.15, -0.5], [0.35, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.5, 0, 0], [-0.4, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.12, 0, 0], [-0.05, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.9, 0, 0], [1.65, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.3, 0, 0.3], [0.1, 0, 0.15], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.6, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, -0.15, 0], [0.2, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_medium_one_handed_light_2": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-0.6, 0.4, -0.3], [-0.25, -0.5, 0.2], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.3, 0, 0], [-0.6, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [-0.1, 0, 0], [0.06, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.8, 0, 0], [1.7, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.2, 0, -0.15], [0.05, 0, 0.25], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.5, 0, 0], [-0.45, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, 0.2, 0], [0.2, -0.2, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_medium_one_handed_heavy_1": {
        "duration": 2.64,
        "times": [0, 0.96, 1.44, 2.64],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1.3, -0.1, -0.6], [0.55, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.9, 0, 0], [-0.3, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.16, 0, 0], [-0.1, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [2, 0, 0], [1.6, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.35, 0, 0.35], [0.1, 0, 0.2], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.7, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.15, -0.2, 0], [0.35, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1.2,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.416,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_medium_one_handed_heavy_2": {
        "duration": 2.64,
        "times": [0, 0.96, 1.44, 2.64],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-0.9, 0.2, -0.2], [-1.55, -0.3, 0.3], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.6, 0, 0], [-0.5, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.1, 0, 0], [-0.12, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.8, 0, 0], [2.2, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.25, 0, -0.1], [0.15, 0, 0.2], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.55, 0, 0], [-0.45, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, 0.15, 0], [0.1, -0.1, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1.2,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.416,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_medium_one_handed_air_1": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1, -0.15, -0.5], [0.35, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.5, 0, 0], [-0.4, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.12, 0, 0], [-0.05, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.9, 0, 0], [1.65, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.3, 0, 0.3], [0.1, 0, 0.15], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.6, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, -0.15, 0], [0.2, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_large_one_handed_light_1": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1, -0.15, -0.5], [0.35, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.5, 0, 0], [-0.4, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.12, 0, 0], [-0.05, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.9, 0, 0], [1.65, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.3, 0, 0.3], [0.1, 0, 0.15], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.6, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, -0.15, 0], [0.2, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_large_one_handed_light_2": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-0.6, 0.4, -0.3], [-0.25, -0.5, 0.2], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.3, 0, 0], [-0.6, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [-0.1, 0, 0], [0.06, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.8, 0, 0], [1.7, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.2, 0, -0.15], [0.05, 0, 0.25], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.5, 0, 0], [-0.45, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, 0.2, 0], [0.2, -0.2, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_large_one_handed_heavy_1": {
        "duration": 2.64,
        "times": [0, 0.96, 1.44, 2.64],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1.3, -0.1, -0.6], [0.55, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.9, 0, 0], [-0.3, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.16, 0, 0], [-0.1, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [2, 0, 0], [1.6, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.35, 0, 0.35], [0.1, 0, 0.2], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.7, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.15, -0.2, 0], [0.35, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1.2,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.416,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_large_one_handed_heavy_2": {
        "duration": 2.64,
        "times": [0, 0.96, 1.44, 2.64],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-0.9, 0.2, -0.2], [-1.55, -0.3, 0.3], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.6, 0, 0], [-0.5, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.1, 0, 0], [-0.12, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.8, 0, 0], [2.2, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.25, 0, -0.1], [0.15, 0, 0.2], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.55, 0, 0], [-0.45, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, 0.15, 0], [0.1, -0.1, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1.2,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.416,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    },
    "shield_large_one_handed_air_1": {
        "duration": 2.2,
        "times": [0, 0.8, 1.2, 2.2],
        "joints": {
            "rightArmShoulder": [[-0.45, 0, 0], [-1, -0.15, -0.5], [0.35, 0, 0], [-0.45, 0, 0]],
            "rightArmElbow": [[-0.85, 0, 0], [-1.5, 0, 0], [-0.4, 0, 0], [-0.85, 0, 0]],
            "rightWristPivot": [[0, 0, 0], [0.12, 0, 0], [-0.05, 0, 0], [0, 0, 0]],
            "rightWeaponMount": [[2.870796, 0, 0], [1.9, 0, 0], [1.65, 0, 0], [2.870796, 0, 0]],
            "leftArmShoulder": [[0, 0, 0], [0.3, 0, 0.3], [0.1, 0, 0.15], [0, 0, 0]],
            "leftArmElbow": [[-0.1, 0, 0], [-0.6, 0, 0], [-0.4, 0, 0], [-0.1, 0, 0]],
            "leftWeaponMount": [[1.7, 0, 0], [0, 0, 0], [0, 0, 0], [1.7, 0, 0]],
            "spine": [[0, 0, 0], [0.1, -0.15, 0], [0.2, 0, 0], [0, 0, 0]]
        },
        "events": [
            {
                "time": 1,
                "name": "hitbox_on",
                "slotKey": "weapon:main_hand"
            },
            {
                "time": 1.18,
                "name": "hitbox_off",
                "slotKey": "weapon:main_hand"
            }
        ]
    }
} satisfies Readonly<Record<string, AuthoredAttackClip>>
