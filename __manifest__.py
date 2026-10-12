{
    'name': 'Remember Last Search',
    'version': '17.0.1.1.0',
    'category': 'Technical',
    'summary': 'Restore the filters, group-by and search you last used on each action',
    'description': """
Remember Last Search
====================
Restores the last used filters, group-by, favorites and search terms
per action. Purely client-side (localStorage). Includes a per-action
toggle and a "forget saved search" item in the Favorites menu.
    """,
    'depends': ['web'],
    'assets': {
        'web.assets_backend': [
            'remember_last_search/static/src/js/search_model_patch.js',
            'remember_last_search/static/src/js/favorite_menu_items.js',
            'remember_last_search/static/src/xml/favorite_menu_items.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
