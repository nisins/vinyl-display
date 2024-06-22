import customartinfo

'''
Used for returning custom album artwork for song and artist combinations
that have been defined.
'''
class CustomArtHandler:
    artMap = {}
    
    '''
    Builds the custom art map using each song and artist combination
    from the list of defined albums in customartinfo.py.
    '''
    def __init__(self):
        for album in customartinfo.albums:
            for song in album[0]:
                self.artMap[song] = album[1]
                
    '''
    Returns custom art for a song and artist combination. Returns
    None if that combination does not have custom art defined for it.
    '''
    def getCustomArt(self, songAndArtist):
        return self.artMap.get(songAndArtist, None)
    
    '''
    Checks if a song and artist combination has custom
    art for it.
    '''
    def songAndArtistExists(self, songAndArtist):
        return None != self.getCustomArt(songAndArtist)
    