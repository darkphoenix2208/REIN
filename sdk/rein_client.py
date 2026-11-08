"""
Rein Python SDK Client

A lightweight, type-safe client for the Rein API.
"""

import requests
from typing import Dict, List, Any, Optional
from dataclasses import dataclass


@dataclass
class ReinConfig:
    base_url: str
    bearer_token: Optional[str] = None
    timeout: int = 30


class ReinClient:
    def __init__(self, config: ReinConfig = None, **kwargs):
        if config:
            self.config = config
        else:
            self.config = ReinConfig(**kwargs)
        
        self.base_url = self.config.base_url.rstrip('/')
        self.bearer_token = self.config.bearer_token
        self.timeout = self.config.timeout
    
    def _request(self, method: str, path: str, json_data: Any = None, requires_auth: bool = False) -> Any:
        url = f"{self.base_url}{path}"
        headers = {'Content-Type': 'application/json'}
        
        if requires_auth and self.bearer_token:
            headers['Authorization'] = f'Bearer {self.bearer_token}'
        
        response = requests.request(
            method=method,
            url=url,
            json=json_data,
            headers=headers,
            timeout=self.timeout
        )
        
        response.raise_for_status()
        return response.json()
    
    # Public endpoints
    
    def check(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Gate check for an action"""
        return self._request('POST', '/v1/check', json_data=request)
    
    def get_ledger(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Query audit ledger"""
        return self._request('GET', f'/v1/ledger?limit={limit}')
    
    def get_checkpoint(self) -> Dict[str, Any]:
        """Get signed checkpoint"""
        return self._request('GET', '/v1/ledger/checkpoint')
    
    def verify_checkpoint(self, checkpoint: Dict[str, Any]) -> Dict[str, bool]:
        """Verify checkpoint signature"""
        return self._request('POST', '/v1/ledger/verify', json_data=checkpoint)
    
    def get_challenge_leaderboard(self) -> Any:
        """Get Beat the Gate challenge leaderboard"""
        return self._request('GET', '/v1/challenge/leaderboard')
    
    def submit_challenge_attempt(self, message: str) -> Dict[str, Any]:
        """Submit a Beat the Gate challenge attempt"""
        return self._request('POST', '/v1/challenge/attempt', json_data={'message': message})
    
    # Authenticated endpoints
    
    def result(self, action_id: str, approved: bool, approver_email: str, totp_code: Optional[str] = None) -> Any:
        """Approve or deny an escalated action"""
        request = {
            'actionId': action_id,
            'approved': approved,
            'approverEmail': approver_email
        }
        if totp_code:
            request['totpCode'] = totp_code
        return self._request('POST', '/v1/result', json_data=request, requires_auth=True)
    
    def get_mandate(self) -> Dict[str, Any]:
        """Get current mandate configuration"""
        return self._request('GET', '/v1/mandate', requires_auth=True)
    
    def backtest(self, candidate: Dict[str, Any]) -> Dict[str, Any]:
        """Backtest mandate changes"""
        return self._request('POST', '/v1/mandate/backtest', json_data={'candidate': candidate}, requires_auth=True)
    
    def get_ops(self) -> Any:
        """Get operations dashboard data"""
        return self._request('GET', '/v1/ops', requires_auth=True)
    
    def get_exposure(self) -> Any:
        """Get exposure metrics"""
        return self._request('GET', '/v1/exposure', requires_auth=True)


# Convenience factory function
def create_client(**kwargs) -> ReinClient:
    return ReinClient(**kwargs)
