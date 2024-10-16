import globals from "globals";
import pluginJs from "@eslint/js";
import userscripts from "eslint-plugin-userscripts";
import stylisticJs from '@stylistic/eslint-plugin-js'


export default [
    {
        files: ["**/*.js"],
        languageOptions: {
            sourceType: "script"
        }
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                unsafeWindow: 'readable',
                GM: 'readable'
            }
        }
    },
    pluginJs.configs.recommended,
    {
        files: ['*.user.js'],
        plugins: {
            userscripts: {
                rules: userscripts.rules
            },
            '@stylistic/js': stylisticJs
        },
        rules: {
            ...userscripts.configs.recommended.rules,
            '@stylistic/js/indent': ['error', 4],
        },
        settings: {
            userscriptVersions: {
                'violentmonkey': '*',
                'tampermonkey': '*',
                'greasemonkey': '*'
            }
        }
    }
];